import PriorityQueue from "priority-queue-typescript";
import {Cell, Execution, MutableGame, MutablePlayer, PlayerID, Player, TerrainTypes, TerraNullius, Tile} from "../Game";
import {PseudoRandom} from "../PseudoRandom";
import {manhattanDist} from "../Util";

export class AttackExecution implements Execution {
    private active: boolean = true;
    private toConquer: PriorityQueue<TileContainer> = new PriorityQueue<TileContainer>(1000, (a: TileContainer, b: TileContainer) => a.priority - b.priority);
    private random = new PseudoRandom(123)

    private _owner: MutablePlayer
    private target: MutablePlayer | TerraNullius

    private mg: MutableGame

    private numTilesWithEnemy = 0
    private borderTiles: Set<Tile> = new Set()

    constructor(
        private troops: number,
        private _ownerID: PlayerID,
        private targetID: PlayerID | null,
        private targetCell: Cell | null
    ) { }

    init(mg: MutableGame, ticks: number) {

        // TODO: remove this and fix directed expansion.
        this.targetCell = null

        this._owner = mg.player(this._ownerID)
        this.target = this.targetID == null ? mg.terraNullius() : mg.player(this.targetID)
        this.troops = Math.min(this._owner.troops(), this.troops)
        this._owner.setTroops(this._owner.troops() - this.troops)
        this.mg = mg

        if (this.target.isPlayer()) {
            for (const exec of mg.executions()) {
                if (exec instanceof AttackExecution) {
                    const otherAttack = exec as AttackExecution
                    if (otherAttack.target == this._owner && this.target == otherAttack._owner) {
                        if (otherAttack.troops > this.troops) {
                            otherAttack.troops -= this.troops
                            otherAttack.calculateToConquer()
                            this.active = false
                            return
                        } else {
                            this.troops -= otherAttack.troops
                            otherAttack.active = false
                        }
                    }
                }
            }
        }

        this.calculateToConquer()
    }

    tick(ticks: number) {
        if (!this.active) {
            return
        }

        let numTilesPerTick = this.numTilesWithEnemy / 4
        if (this.targetCell != null) {
            numTilesPerTick /= 2
        }
        let badTiles = 0
        while (numTilesPerTick > 0) {
            if (this.troops < 1) {
                this.active = false
                return
            }

            if (this.toConquer.size() < this.numTilesWithEnemy / 2) {
                this.calculateToConquer()
            }
            if (this.toConquer.size() == 0 || badTiles > 100) {
                this.active = false
                this._owner.addTroops(this.troops)
                return
            }

            const toConquerContainer = this.toConquer.poll()
            const tileToConquer: Tile = toConquerContainer.tile
            const onBorder = tileToConquer.neighbors().filter(t => t.owner() == this._owner).length > 0
            if (tileToConquer.owner() != this.target || !onBorder) {
                badTiles++
                continue
            }
            // TODO: move this to configs
            this._owner.conquer(tileToConquer)
            if (this.target.isPlayer()) {
                this.troops -= Math.max(this.target.troops() / this._owner.troops(), 1)
                numTilesPerTick -= Math.max(this.target.troops() / this._owner.troops(), .25)
            } else {
                this.troops -= 1
                numTilesPerTick -= 1
            }
        }
    }

    private calculateToConquer() {
        this.numTilesWithEnemy = 0
        this.toConquer.clear()

        const newBorder: Set<Tile> = new Set()
        let existingBorder: ReadonlySet<Tile> = this.borderTiles
        if (existingBorder.size == 0) {
            existingBorder = this._owner.borderTiles()
        }
        for (const tile of existingBorder) {
            for (const neighbor of tile.neighbors()) {
                if (neighbor.terrain() == TerrainTypes.Water || neighbor.owner() != this.target) {
                    continue
                }
                newBorder.add(neighbor)
                this.numTilesWithEnemy += 1
                let numOwnedByMe = neighbor.neighbors()
                    .filter(t => t.terrain() == TerrainTypes.Land)
                    .filter(t => t.owner() == this._owner)
                    .length
                let dist = 0
                if (this.targetCell != null) {
                    dist = manhattanDist(tile.cell(), this.targetCell)
                }
                if (numOwnedByMe > 2) {
                    numOwnedByMe = 1000
                }
                this.toConquer.add(new TileContainer(neighbor, dist + -numOwnedByMe + (tile.cell().x * tile.cell().y) % 2))
            }
        }
        this.borderTiles = newBorder
    }

    owner(): MutablePlayer {
        return this._owner
    }

    isActive(): boolean {
        return this.active
    }

}


class TileContainer {
    constructor(public readonly tile: Tile, public readonly priority: number) { }
}