import { AllPlayers, Cell, Execution, MutableGame, MutablePlayer, MutableUnit, Player, PlayerID, TerrainType, Tile, Unit, UnitType } from "../game/Game";
import { PathFinder } from "../pathfinding/PathFinding";
import { PathFindResultType } from "../pathfinding/AStar";
import { SerialAStar } from "../pathfinding/SerialAStar";
import { PseudoRandom } from "../PseudoRandom";
import { bfs, dist, manhattanDist } from "../Util";
import { TradeShipExecution } from "./TradeShipExecution";
import { consolex } from "../Consolex";
import { MiniAStar } from "../pathfinding/MiniAStar";
import { TileRef } from "../game/GameMap";

export class PortExecution implements Execution {

    private active = true
    private mg: MutableGame
    private port: MutableUnit
    private random: PseudoRandom
    private portPaths = new Map<MutableUnit, Tile[]>()
    private computingPaths = new Map<MutableUnit, MiniAStar>()

    constructor(
        private _owner: PlayerID,
        private cell: Cell,
    ) { }


    init(mg: MutableGame, ticks: number): void {
        this.mg = mg
        this.random = new PseudoRandom(mg.ticks())
    }

    tick(ticks: number): void {

        if (this.port == null) {
            // TODO: use canBuild
            const tile = this.mg.tile(this.cell)
            const player = this.mg.player(this._owner)
            if (!player.canBuild(UnitType.Port, tile)) {
                consolex.warn(`player ${player} cannot build port at ${this.cell}`)
                this.active = false
                return
            }
            const spawns = Array.from(bfs(tile, dist(tile, 20)))
                .filter(t => t.terrain().isOceanShore() && t.owner() == player)
                .sort((a, b) => manhattanDist(a.cell(), tile.cell()) - manhattanDist(b.cell(), tile.cell()))

            if (spawns.length == 0) {
                consolex.warn(`cannot find spawn for port`)
                this.active = false
                return
            }
            this.port = player.buildUnit(UnitType.Port, 0, spawns[0])
        }
        if (!this.port.isActive()) {
            this.active = false
            return
        }


        const alliedPorts = this.player().alliances().map(a => a.other(this.player())).flatMap(p => p.units(UnitType.Port))
        const alliedPortsSet = new Set(alliedPorts)

        const allyConnections = new Set(Array.from(this.portPaths.keys()).map(p => p.owner()))
        allyConnections


        for (const port of alliedPorts) {
            if (allyConnections.has(port.owner())) {
                continue
            }
            allyConnections.add(port.owner())
            if (this.computingPaths.has(port)) {
                const aStar = this.computingPaths.get(port)
                switch (aStar.compute()) {
                    case PathFindResultType.Completed:
                        this.portPaths.set(port, aStar.reconstructPath().map(cell => this.mg.tile(cell)))
                        this.computingPaths.delete(port)
                        break
                    case PathFindResultType.Pending:
                        break
                    case PathFindResultType.PathNotFound:
                        consolex.warn(`path not found to port`)
                        break
                }
                continue
            }

            const pf = new MiniAStar(
                this.mg.map(),
                this.mg.miniMap(),
                this.port.tile().ref(),
                port.tile().ref(),
                (tr: TileRef) => this.mg.miniMap().isOcean(tr),
                10_000,
                25
            )
            this.computingPaths.set(port, pf)
        }

        for (const port of this.portPaths.keys()) {
            if (!port.isActive() || !alliedPortsSet.has(port)) {
                this.portPaths.delete(port)
                this.computingPaths.delete(port)
            }
        }

        const portConnections = Array.from(this.portPaths.keys())

        if (portConnections.length > 0 && this.random.chance(this.mg.config().tradeShipSpawnRate())) {
            const port = this.random.randElement(portConnections)
            const path = this.portPaths.get(port)
            if (path != null) {
                const pf = PathFinder.Mini(this.mg, 10, false)
                this.mg.addExecution(new TradeShipExecution(this.player().id(), this.port, port, pf, path))
            }
        }
    }

    owner(): MutablePlayer {
        return null
    }

    isActive(): boolean {
        return this.active
    }

    activeDuringSpawnPhase(): boolean {
        return false
    }

    player(): MutablePlayer {
        return this.port.owner()
    }

}