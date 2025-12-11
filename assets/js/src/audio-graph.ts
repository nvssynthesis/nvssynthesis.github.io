/**
 * Audio Graph - Web Audio API wrapper with cycle detection and connection management
 */

export class AudioGraph {
    private nodes = new Map<number, AudioGraphNode>();
    private connections = new Map<number, Set<number>>();
    private nextId = 0;

    createNode(webAudioNode: AudioNode, name?: string): AudioGraphNode {
        const id = this.nextId++;
        const node = new AudioGraphNode(webAudioNode, id, name || `Node${id}`, this);
        this.nodes.set(id, node);
        this.connections.set(id, new Set());
        return node;
    }

    safeConnect(source: AudioGraphNode, destination: AudioGraphNode): boolean {
        // check for duplicate connections
        if (this.connections.get(source.id)?.has(destination.id)) {
            console.log(`Already connected: ${source.name} => ${destination.name}`);
            return true;
        }

        // check for cycles
        if (this.wouldCreateCycle(source.id, destination.id)) {
            console.warn(`Connection would create cycle: ${source.name} => ${destination.name}; routing through intermediate delay`);
            // create an intermediate DelayNode to break the cycle, managed by this graph
            const delayNode = source.webAudioNode.context.createDelay();
            const delayGraphNode = this.createNode(delayNode, `delay_${source.id}_to_${destination.id}`);
            // connect source to delay
            this.connectNodes(source, delayGraphNode);
            // connect delay to destination
            this.connectNodes(delayGraphNode, destination);
            return true;
        }

        // make the connection
        return this.connectNodes(source, destination);
    }

    private connectNodes(source: AudioGraphNode, destination: AudioGraphNode): boolean {
        try {
            source.webAudioNode.connect(destination.webAudioNode);
            this.connections.get(source.id)!.add(destination.id);
            console.log(`Connected: ${source.name} => ${destination.name}`);
            return true;
        } catch (error) {
            console.error(`Failed to connect ${source.name} to ${destination.name}:`, error);
            return false;
        }
    }

    private disconnectNodes(source: AudioGraphNode, destination?: AudioGraphNode): void {
        if (destination) {
            source.webAudioNode.disconnect(destination.webAudioNode);
            this.connections.get(source.id)?.delete(destination.id);
            console.log(`Disconnected: ${source.name} => ${destination.name}`);
        } else {
            source.webAudioNode.disconnect();
            this.connections.set(source.id, new Set());
            console.log(`Disconnected all from: ${source.name}`);
        }
    }

    removeConnection(sourceId: number, destinationId: number) {
        const source = this.nodes.get(sourceId);
        const destination = this.nodes.get(destinationId);
        if (source && destination) {
            // clean up any intermediate delays between source and destination
            this.removeIntermediateDelays(sourceId, destinationId);
            this.disconnectNodes(source, destination);
        }
    }

    removeAllConnectionsFrom(sourceId: number) {
        const source = this.nodes.get(sourceId);
        if (source) {
            // clean up all delays originating from this source
            this.removeAllIntermediateDelaysFrom(sourceId);
            this.disconnectNodes(source);
        }
    }

    private removeIntermediateDelays(sourceId: number, destinationId: number): void {
        // intermediate delays are named "delay_sourceId_to_destinationId"
        const delayName = `delay_${sourceId}_to_${destinationId}`;
        const delayToRemove = Array.from(this.nodes.values()).find(node => node.name === delayName);
        
        if (delayToRemove) {
            this.disconnectNodes(delayToRemove);
            this.nodes.delete(delayToRemove.id);
            this.connections.delete(delayToRemove.id);
            console.log(`Cleaned up intermediate delay: ${delayName}`);
        }
    }

    private removeAllIntermediateDelaysFrom(sourceId: number): void {
        // find all delays that originate from this source (named "delay_sourceId_to_*")
        const delayPrefix = `delay_${sourceId}_to_`;
        const delaysToRemove = Array.from(this.nodes.values()).filter(node => node.name.startsWith(delayPrefix));
        
        for (const delay of delaysToRemove) {
            this.disconnectNodes(delay);
            this.nodes.delete(delay.id);
            this.connections.delete(delay.id);
            console.log(`Cleaned up intermediate delay: ${delay.name}`);
        }
    }

    safeConnectToParam(
        source: AudioGraphNode,
        destination: AudioGraphNode,
        paramName: string
    ): boolean {
        // special case for connecting to AudioParam (like frequency)
        const audioParam = (destination.webAudioNode as any)[paramName];
        if (!audioParam || typeof audioParam.value !== 'number') {
            console.warn(`Parameter ${paramName} not found on ${destination.name}`);
            return false;
        }
        // duplicate check
        if (this.connections.get(source.id)?.has(destination.id)) {
            console.log(`Already connected: ${source.name} => ${destination.name}.${paramName}`);
            return true;
        }
        // cycle check
        if (this.wouldCreateCycle(source.id, destination.id)) {
            console.warn(`AudioParam connection would create cycle: ${source.name} => ${destination.name}.${paramName}`);
            const delayNode = source.webAudioNode.context.createDelay();
            const delayGraphNode = this.createNode(delayNode, `delay_${source.id}_to_${destination.id}_${paramName}`);

            // connect: source -> delay -> destination.param
            this.connectNodes(source, delayGraphNode);
            delayGraphNode.webAudioNode.connect(audioParam);
            this.connections.get(delayGraphNode.id)!.add(destination.id);
            console.log(`Connected via delay: ${source.name} => ${delayGraphNode.name} => ${destination.name}.${paramName}`);
            return true;
        }

        // make the connection and track it
        source.webAudioNode.connect(audioParam);
        this.connections.get(source.id)!.add(destination.id);
        console.log(`Connected: ${source.name} => ${destination.name}.${paramName}`);
        return true;
    }

    private wouldCreateCycle(from: number, to: number): boolean {
        // temporarily add the connection
        this.connections.get(from)!.add(to);
        
        // check for cycle using DFS
        const visited = new Set<number>();
        const recStack = new Set<number>();
        const hasCycle = this.hasCycleFrom(to, visited, recStack);
        
        // remove the temporary connection
        this.connections.get(from)!.delete(to);
        
        return hasCycle;
    }

    private hasCycleFrom(nodeId: number, visited: Set<number>, recStack: Set<number>): boolean {
        // treat delay nodes as breaking the cycle path in audio context
        const currentNode = this.nodes.get(nodeId);
        if (currentNode && isDelayNode(currentNode)) {
            return false;
        }

        visited.add(nodeId);
        recStack.add(nodeId);
        
        const neighbors = this.connections.get(nodeId) || new Set();
        for (const neighborId of neighbors) {
            const neighborNode = this.nodes.get(neighborId);
            if (neighborNode && isDelayNode(neighborNode)) {
                continue; // delays break cycles
            }
            if (!visited.has(neighborId)) {
                if (this.hasCycleFrom(neighborId, visited, recStack)) {
                    return true;
                }
            } else if (recStack.has(neighborId)) {
                return true; // back edge found = cycle
            }
        }
        
        recStack.delete(nodeId);
        return false;
    }

    // debug utilities 
    printConnections() {
        console.log('Audio Graph Connections:');
        for (const [nodeId, connections] of this.connections) {
            const node = this.nodes.get(nodeId);
            const connectedNames = Array.from(connections).map(id => this.nodes.get(id)?.name || `Node${id}`);
            console.log(`  ${node?.name} => [${connectedNames.join(', ')}]`);
        }
    }

    getConnectionCount(): number {
        let total = 0;
        for (const connections of this.connections.values()) {
            total += connections.size;
        }
        return total;
    }

    removeNode(node: AudioGraphNode): void {
        // disconnect the node from everything first
        node.disconnect();
        // remove from tracking
        this.nodes.delete(node.id);
        this.connections.delete(node.id);
        console.log(`Removed node from graph: ${node.name}`);
    }
}

export class AudioGraphNode {
    constructor(
        public readonly webAudioNode: AudioNode,
        public readonly id: number,
        public readonly name: string,
        private graph: AudioGraph
    ) {}

    connect(destination: AudioGraphNode): boolean {
        return this.graph.safeConnect(this, destination);
    }

    connectToParam(destination: AudioGraphNode, paramName: string): boolean {
        return this.graph.safeConnectToParam(this, destination, paramName);
    }

    disconnect(destination?: AudioGraphNode) {
        if (destination) {
            this.graph.removeConnection(this.id, destination.id);
        } else {
            this.graph.removeAllConnectionsFrom(this.id);
        }
    }

    // convenience getters for common node types
    get frequency(): AudioParam | undefined {
        return (this.webAudioNode as any).frequency;
    }

    get gain(): AudioParam | undefined {
        return (this.webAudioNode as any).gain;
    }

    // delegate common methods to the underlying Web Audio node
    start(when?: number) {
        if ('start' in this.webAudioNode && typeof this.webAudioNode.start === 'function') {
            (this.webAudioNode as any).start(when);
        }
    }

    stop(when?: number) {
        if ('stop' in this.webAudioNode && typeof this.webAudioNode.stop === 'function') {
            (this.webAudioNode as any).stop(when);
        }
    }
}

// type guards for specific node types
export function isOscillatorNode(node: AudioGraphNode): node is AudioGraphNode & { webAudioNode: OscillatorNode } {
    return node.webAudioNode instanceof OscillatorNode;
}

export function isGainNode(node: AudioGraphNode): node is AudioGraphNode & { webAudioNode: GainNode } {
    return node.webAudioNode instanceof GainNode;
}

export function isDelayNode(node: AudioGraphNode): node is AudioGraphNode & { webAudioNode: DelayNode } {
    return node.webAudioNode instanceof DelayNode;
}