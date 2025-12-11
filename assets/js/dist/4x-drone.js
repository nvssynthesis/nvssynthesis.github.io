import { AudioGraph, isOscillatorNode, isGainNode } from './audio-graph.js';
import { DroneGUI } from './drone-gui.js';
let audioContext = null;
class DroneSynth {
    constructor(initialAlgorithm) {
        this.audioGraph = new AudioGraph();
        this.oscillators = [];
        this.carrierGains = [];
        this.modGains = new Map(); // keyed by "source_target"
        this.outputGainNode = null;
        this.clipper = null; // store reference to clipper
        this.connections = { mod: [], out: [] };
        this.baseFreq = 55;
        this.freqRatios = [1.0, 2.0, 3.0, 4.0];
        this.beatFreqs = [0.0, 1.5135, 2.3035, 2.46];
        this.modDepth = 1;
        // Operator amplitudes (0-1)
        this.targetAmps = [0.25, 0.25, 0.25, 0.25];
        this.currentAmps = [0.25, 0.25, 0.25, 0.25];
        this.targetVolume = 0.8;
        this.currentVolume = 0.8;
        this.animationId = undefined;
        this.connections = JSON.parse(initialAlgorithm);
    }
    setAlgorithm(alg) {
        console.log('Switching to algorithm:', alg);
        this.connections = JSON.parse(alg);
        // only reinitialize if audio is already running (oscillators exist)
        if (this.oscillators.length > 0) {
            this.disconnectAll();
            this.initChain();
            // debug: Print new audio graph state
            console.log('Audio Graph after algorithm change:', this.audioGraph.getConnectionCount(), 'connections');
            this.audioGraph.printConnections();
        }
    }
    setModDepth(depth) {
        this.modDepth = depth;
        // update all existing mod gain values with new depth
        this.modGains.forEach((modGain) => {
            if (isGainNode(modGain)) {
                // extract the target index from the node name (e.g., "mod_gain_0_to_2" -> 2)
                const match = modGain.name.match(/_(\d+)$/);
                const targetIndex = match ? parseInt(match[1]) : 0;
                modGain.webAudioNode.gain.value = this.modDepth * (this.baseFreq * this.freqRatios[targetIndex] + this.beatFreqs[targetIndex]);
            }
        });
    }
    setBaseFreq(freq) {
        this.baseFreq = freq;
        // update all oscillator frequencies
        for (let i = 0; i < this.oscillators.length; i++) {
            if (isOscillatorNode(this.oscillators[i])) {
                this.oscillators[i].webAudioNode.frequency.value = this.baseFreq * this.freqRatios[i] + this.beatFreqs[i];
            }
        }
        // update all mod gain values based on new base frequency
        this.modGains.forEach((modGain) => {
            if (isGainNode(modGain)) {
                const match = modGain.name.match(/_(\d+)$/);
                const targetIndex = match ? parseInt(match[1]) : 0;
                modGain.webAudioNode.gain.value = this.modDepth * (this.baseFreq * this.freqRatios[targetIndex]);
            }
        });
    }
    setVolume(vol, immediate = false) {
        const newGain = Math.pow(10, vol / 20); // convert dB to linear
        this.targetVolume = newGain;
        if (immediate) {
            this.currentVolume = newGain;
        }
    }
    setClipper(clipper) {
        this.clipper = clipper;
        if (this.outputGainNode) {
            this.outputGainNode.webAudioNode.connect(clipper);
        }
    }
    disconnectAll() {
        // disconnect all oscillators and gains from everything using audio graph wrapper
        this.oscillators.forEach(osc => osc.disconnect());
        this.carrierGains.forEach(gain => gain.disconnect());
        // Disconnect and remove modGains from audio graph
        this.modGains.forEach(modGain => {
            this.audioGraph.removeNode(modGain);
        });
        this.modGains.clear();
        if (this.outputGainNode) {
            this.outputGainNode.disconnect();
        }
    }
    initChain() {
        // reset oscillator frequencies to base values before reconnecting
        this.resetOscillatorFrequencies();
        /*
        example:
            interface AlgorithmConfig {
                mod: number[][] = [[0, 2], [1, 3], [2, 0], [3, 1]];
                out: number[] = [0, 1, 2, 3];
            }
        */
        for (const [source, target] of this.connections.mod) {
            const modGainNode = audioContext.createGain();
            // mod gain shall be 2 * target oscillator's base frequency
            modGainNode.gain.value = this.modDepth * (this.baseFreq * this.freqRatios[target] + this.beatFreqs[target]);
            const key = `${source}_${target}`;
            const modGain = this.audioGraph.createNode(modGainNode, `mod_gain_${key}`);
            this.modGains.set(key, modGain);
            this.oscillators[source]?.connect(modGain);
            // connect to AudioParam using connectToParam method
            modGain.connectToParam(this.oscillators[target], 'frequency');
        }
        for (const out of this.connections.out) {
            this.oscillators[out]?.connect(this.carrierGains[out]);
            if (this.outputGainNode) {
                this.carrierGains[out]?.connect(this.outputGainNode);
            }
        }
        if (this.clipper && this.outputGainNode) {
            this.outputGainNode.webAudioNode.connect(this.clipper);
        }
    }
    resetOscillatorFrequencies() {
        // reset all oscillators to their base frequencies
        for (let i = 0; i < 4; i++) {
            if (this.oscillators[i] && isOscillatorNode(this.oscillators[i])) {
                this.oscillators[i].webAudioNode.frequency.value = this.baseFreq * this.freqRatios[i] + this.beatFreqs[i];
            }
        }
    }
    startSmoothingLoop() {
        const smooth = () => {
            // Safety checks - now uses global audioContext
            if (!audioContext || this.carrierGains.length === 0)
                return;
            const now = audioContext.currentTime;
            const scheduledTime = now + 0.05; // schedule slightly ahead
            // smooth towards target values
            for (let i = 0; i < 4; i++) {
                this.currentAmps[i] += (this.targetAmps[i] - this.currentAmps[i]) * 0.1;
                if (this.carrierGains[i] && isGainNode(this.carrierGains[i])) {
                    this.carrierGains[i].webAudioNode.gain.setTargetAtTime(cosWeighting(this.currentAmps[i]) * 0.2, scheduledTime, 0.015 // small time constant for quick response
                    );
                }
            }
            this.currentVolume += (this.targetVolume - this.currentVolume) * 0.5;
            if (this.outputGainNode && isGainNode(this.outputGainNode)) {
                this.outputGainNode.webAudioNode.gain.setTargetAtTime(this.currentVolume, scheduledTime, 0.015);
            }
            this.animationId = requestAnimationFrame(smooth);
        };
        smooth();
    }
    start() {
        if (!audioContext)
            return;
        // Sync synth parameters from GUI sliders before starting
        const modDepthSlider = document.getElementById('modDepthSlider');
        const baseFreqSlider = document.getElementById('baseFreqSlider');
        const volumeSlider = document.getElementById('volumeSlider');
        if (modDepthSlider)
            this.setModDepth(parseFloat(modDepthSlider.value));
        if (baseFreqSlider)
            this.setBaseFreq(parseFloat(baseFreqSlider.value));
        if (volumeSlider)
            this.setVolume(parseFloat(volumeSlider.value), true);
        // recreate oscillators (they can only be started once)
        this.disconnectAll();
        this.oscillators = [];
        this.carrierGains = [];
        this.modGains.clear();
        // recreate audio nodes
        for (let i = 0; i < 4; i++) {
            const oscNode = audioContext.createOscillator();
            oscNode.type = 'sine';
            oscNode.frequency.value = this.baseFreq * this.freqRatios[i] + this.beatFreqs[i];
            const osc = this.audioGraph.createNode(oscNode, `osc_${i}`);
            this.oscillators.push(osc);
            const gainNode = audioContext.createGain();
            gainNode.gain.value = cosWeighting(this.currentAmps[i]) * 0.2;
            const gain = this.audioGraph.createNode(gainNode, `carrier_gain_${i}`);
            this.carrierGains.push(gain);
        }
        const outputGainNode = audioContext.createGain();
        outputGainNode.gain.value = this.currentVolume;
        this.outputGainNode = this.audioGraph.createNode(outputGainNode, 'master_output');
        if (this.clipper) {
            this.outputGainNode.webAudioNode.connect(this.clipper);
        }
        this.initChain();
        // start oscillators
        this.oscillators.forEach(osc => osc.start());
        this.startSmoothingLoop();
    }
    stop() {
        // stop the animation loop first
        if (this.animationId !== undefined) {
            cancelAnimationFrame(this.animationId);
            this.animationId = undefined;
        }
        // stop oscillators (they cannot be restarted, must be recreated)
        this.oscillators.forEach(osc => osc.stop());
    }
    updateTargetAmplitudes(normX, normY) {
        // calculate amplitudes based on proximity to corners
        this.targetAmps[0] = (1 - normX) * (1 - normY); // top-left
        this.targetAmps[1] = normX * (1 - normY); // top-right
        this.targetAmps[2] = (1 - normX) * normY; // bottom-left
        this.targetAmps[3] = normX * normY; // bottom-right
    }
}
// create audio context once at module load
audioContext = new (window.AudioContext || window.webkitAudioContext)();
function createClipper(threshold) {
    if (!audioContext)
        throw new Error('AudioContext not initialized');
    const clipper = audioContext.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1; // Map to [-1..1]
        curve[i] = Math.max(-threshold, Math.min(threshold, x));
    }
    clipper.curve = curve;
    return clipper;
}
// get init algorithm from HTML
const algorithmSelect = document.getElementById('algorithmSelect');
const initialAlgorithm = algorithmSelect.value;
const droneSynth = new DroneSynth(initialAlgorithm);
// set up clipper (to be reused across start/stop)
const clipper = createClipper(0.8);
droneSynth.setClipper(clipper);
clipper.connect(audioContext.destination);
const gui = new DroneGUI({
    onStartAudio: () => {
        droneSynth.start();
    },
    onStopAudio: () => {
        droneSynth.stop();
    },
    onAlgorithmChange: (algorithm) => {
        droneSynth.setAlgorithm(algorithm);
    },
    onModDepthChange: (depth) => {
        droneSynth.setModDepth(depth);
    },
    onBaseFreqChange: (freq) => {
        droneSynth.setBaseFreq(freq);
    },
    onVolumeChange: (vol) => {
        droneSynth.setVolume(vol);
    },
    onAmplitudeUpdate: (normX, normY) => {
        droneSynth.updateTargetAmplitudes(normX, normY);
    }
});
function cosWeighting(t) {
    return Math.cos((1 - t) * Math.PI * 0.5);
}
// sync visual feedback with synth state
function updateVisualization() {
    if (gui.getIsRunning()) {
        gui.updateAmplitudes(droneSynth.currentAmps);
    }
    // always draw to show cursor updates even when audio is off
    gui.draw();
    requestAnimationFrame(updateVisualization);
}
updateVisualization();
//# sourceMappingURL=4x-drone.js.map