import { Colord } from "colord";
import { Theme } from "../../../core/configuration/Config";
import { Unit, Cell, Game, Tile, UnitType, Player, UnitUpdate } from "../../../core/game/Game";
import { bfs, dist, euclDist } from "../../../core/Util";
import { Layer } from "./Layer";
import { EventBus } from "../../../core/EventBus";
import { AlternateViewEvent } from "../../InputHandler";
import { ClientID } from "../../../core/Schemas";
import { GameView } from "../../../core/GameView";

enum Relationship {
    Self,
    Ally,
    Enemy
}

export class UnitLayer implements Layer {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;

    private boatToTrail = new Map<Unit, Set<Tile>>();

    private theme: Theme = null;

    private alternateView = false

    private myPlayer: Player | null = null

    private oldShellTile = new Map<Unit, Tile>()

    constructor(private game: GameView, private eventBus: EventBus, private clientID: ClientID) {
        this.theme = game.config().theme();
    }

    shouldTransform(): boolean {
        return true;
    }

    tick() {
        if (this.myPlayer == null) {
            this.myPlayer = this.game.playerByClientID(this.clientID)
        }
        for (const unit of this.game.units()) {
            if (unit.wasUpdated())
                this.onUnitEvent(unit)
        }
    }

    init() {
        this.eventBus.on(AlternateViewEvent, e => this.onAlternativeViewEvent(e))
        this.redraw()
    }

    renderLayer(context: CanvasRenderingContext2D) {
        context.drawImage(
            this.canvas,
            -this.game.width() / 2,
            -this.game.height() / 2,
            this.game.width(),
            this.game.height()
        );
    }

    onAlternativeViewEvent(event: AlternateViewEvent) {
        this.alternateView = event.alternateView
        this.redraw()
    }


    redraw() {
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext("2d");

        this.canvas.width = this.game.width();
        this.canvas.height = this.game.height();
        for (const unit of this.game.units()) {
            // this.onUnitEvent(new UnitEvent(unit, unit.tile()))
        }
    }

    private relationship(unit: Unit): Relationship {
        if (this.myPlayer == null) {
            return Relationship.Enemy
        }
        if (this.myPlayer == unit.owner()) {
            return Relationship.Self
        }
        if (this.myPlayer.isAlliedWith(unit.owner())) {
            return Relationship.Ally
        }
        return Relationship.Enemy
    }

    onUnitEvent(unit: Unit) {
        switch (unit.type()) {
            case UnitType.TransportShip:
                this.handleBoatEvent(unit);
                break;
            case UnitType.Destroyer:
                this.handleDestroyerEvent(unit);
                break;
            case UnitType.Battleship:
                this.handleBattleshipEvent(unit);
                break;
            case UnitType.Shell:
                this.handleShellEvent(unit)
                break;
            case UnitType.TradeShip:
                this.handleTradeShipEvent(unit)
                break;
            case UnitType.AtomBomb:
            case UnitType.HydrogenBomb:
                this.handleNuke(unit)
                break
        }
    }

    private handleDestroyerEvent(unit: Unit) {
        const rel = this.relationship(unit)
        bfs(unit.lastTile(), euclDist(unit.lastTile(), 4)).forEach(t => {
            this.clearCell(t.cell());
        });
        if (!unit.isActive()) {
            return
        }
        bfs(unit.tile(), euclDist(unit.tile(), 4))
            .forEach(t => this.paintCell(t.cell(), rel, this.theme.borderColor(unit.owner().info()), 255));
        bfs(unit.tile(), dist(unit.tile(), 3))
            .forEach(t => this.paintCell(t.cell(), rel, this.theme.territoryColor(unit.owner().info()), 255));
    }

    private handleBattleshipEvent(unit: Unit) {
        const rel = this.relationship(unit)
        bfs(unit.lastTile(), euclDist(unit.lastTile(), 6)).forEach(t => {
            this.clearCell(t.cell());
        });
        if (!unit.isActive()) {
            return
        }
        bfs(unit.tile(), euclDist(unit.tile(), 5))
            .forEach(t => this.paintCell(t.cell(), rel, this.theme.territoryColor(unit.owner().info()), 255));
        bfs(unit.tile(), dist(unit.tile(), 4))
            .forEach(t => this.paintCell(t.cell(), rel, this.theme.borderColor(unit.owner().info()), 255));
        bfs(unit.tile(), euclDist(unit.tile(), 1))
            .forEach(t => this.paintCell(t.cell(), rel, this.theme.territoryColor(unit.owner().info()), 255));
    }

    private handleShellEvent(unit: Unit) {
        const rel = this.relationship(unit)

        this.clearCell(unit.lastTile().cell())
        if (this.oldShellTile.has(unit)) {
            this.clearCell(this.oldShellTile.get(unit).cell())
        }

        this.oldShellTile.set(unit, unit.lastTile())
        if (!unit.isActive()) {
            return
        }
        this.paintCell(unit.tile().cell(), rel, this.theme.borderColor(unit.owner().info()), 255)
        this.paintCell(unit.lastTile().cell(), rel, this.theme.borderColor(unit.owner().info()), 255)
    }


    private handleNuke(unit: Unit) {
        const rel = this.relationship(unit)
        bfs(unit.lastTile(), euclDist(unit.lastTile(), 2)).forEach(t => {
            this.clearCell(t.cell());
        });
        if (unit.isActive()) {
            bfs(unit.tile(), euclDist(unit.tile(), 2))
                .forEach(t => this.paintCell(t.cell(), rel, this.theme.borderColor(unit.owner().info()), 255));
        }

    }

    private handleTradeShipEvent(unit: Unit) {
        const rel = this.relationship(unit)
        bfs(unit.lastTile(), euclDist(unit.lastTile(), 3)).forEach(t => {
            this.clearCell(t.cell());
        });
        if (unit.isActive()) {
            bfs(unit.tile(), dist(unit.tile(), 2))
                .forEach(t => this.paintCell(t.cell(), rel, this.theme.territoryColor(unit.owner().info()), 255));
        }
        if (unit.isActive()) {
            bfs(unit.tile(), dist(unit.tile(), 1))
                .forEach(t => this.paintCell(t.cell(), rel, this.theme.borderColor(unit.owner().info()), 255));
        }
    }

    private handleBoatEvent(unit: Unit) {
        const rel = this.relationship(unit)
        if (!this.boatToTrail.has(unit)) {
            this.boatToTrail.set(unit, new Set<Tile>());
        }
        const trail = this.boatToTrail.get(unit);
        trail.add(unit.lastTile());
        bfs(unit.lastTile(), dist(unit.lastTile(), 3)).forEach(t => {
            this.clearCell(t.cell());
        });
        if (unit.isActive()) {
            for (const t of trail) {
                this.paintCell(t.cell(), rel, this.theme.territoryColor(unit.owner().info()), 150);
            }
            bfs(unit.tile(), dist(unit.tile(), 2))
                .forEach(t => this.paintCell(t.cell(), rel, this.theme.borderColor(unit.owner().info()), 255));
            bfs(unit.tile(), dist(unit.tile(), 1))
                .forEach(t => this.paintCell(t.cell(), rel, this.theme.territoryColor(unit.owner().info()), 255));
        } else {
            trail.forEach(t => this.clearCell(t.cell()));
            this.boatToTrail.delete(unit);
        }
    }

    paintCell(cell: Cell, relationship: Relationship, color: Colord, alpha: number) {
        this.clearCell(cell)
        if (this.alternateView) {
            switch (relationship) {
                case Relationship.Self:
                    this.context.fillStyle = this.theme.selfColor().toRgbString()
                    break
                case Relationship.Ally:
                    this.context.fillStyle = this.theme.allyColor().toRgbString()
                    break
                case Relationship.Enemy:
                    this.context.fillStyle = this.theme.enemyColor().toRgbString()
                    break
            }
        } else {
            this.context.fillStyle = color.alpha(alpha / 255).toRgbString();
        }
        this.context.fillRect(cell.x, cell.y, 1, 1);
    }

    clearCell(cell: Cell) {
        this.context.clearRect(cell.x, cell.y, 1, 1);
    }
}