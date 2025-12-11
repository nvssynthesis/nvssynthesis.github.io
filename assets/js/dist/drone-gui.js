// GUI controller for 4-operator drone synthesizer
export class DroneGUI {
    constructor(callbacks) {
        this.isRunning = false;
        this.isDragging = false;
        // Velocity-sensitive slider control
        this.sliderDragState = {
            active: false,
            slider: null,
            lastX: 0,
            lastTime: 0,
            currentValue: 0
        };
        this.currentAmps = [0.25, 0.25, 0.25, 0.25];
        // Track cursor position for drawing
        this.cursorX = undefined;
        this.cursorY = undefined;
        this.callbacks = callbacks;
        // get DOM elements
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.startBtn = document.getElementById('startBtn');
        this.statusDisplay = document.getElementById('status');
        this.algorithmSelect = document.getElementById('algorithmSelect');
        this.modDepthSlider = document.getElementById('modDepthSlider');
        this.modDepthValue = document.getElementById('modDepthValue');
        this.baseFreqSlider = document.getElementById('baseFreqSlider');
        this.baseFreqValue = document.getElementById('baseFreqValue');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        this.setupEventListeners();
        this.initializeDisplayValues();
        this.initializeCursorPosition();
        this.draw();
    }
    initializeCursorPosition() {
        // Calculate cursor position from default amplitudes [0.25, 0.25, 0.25, 0.25]
        // Using the inverse of updateTargetAmplitudes logic:
        // targetAmps[0] = (1 - normX) * (1 - normY) = 0.25
        // targetAmps[1] = normX * (1 - normY) = 0.25
        // targetAmps[2] = (1 - normX) * normY = 0.25
        // targetAmps[3] = normX * normY = 0.25
        // This gives us normX = 0.5, normY = 0.5 (center)
        this.cursorX = this.canvas.width * 0.5;
        this.cursorY = this.canvas.height * 0.5;
    }
    setupEventListeners() {
        // start/stop button
        this.startBtn.addEventListener('click', () => {
            if (this.isRunning) {
                this.stopAudio();
            }
            else {
                this.startAudio();
            }
        });
        this.algorithmSelect.addEventListener('change', (e) => {
            const target = e.target;
            if (target) {
                this.callbacks.onAlgorithmChange(target.value);
            }
        });
        this.modDepthSlider.addEventListener('input', (e) => {
            const slider = e.target;
            const newDepth = parseFloat(slider.value);
            this.modDepthValue.textContent = newDepth.toFixed(3);
            this.callbacks.onModDepthChange(newDepth);
        });
        this.baseFreqSlider.addEventListener('input', (e) => {
            const slider = e.target;
            const newFreq = parseFloat(slider.value);
            this.baseFreqValue.textContent = newFreq + ' Hz';
            this.callbacks.onBaseFreqChange(newFreq);
        });
        this.volumeSlider.addEventListener('input', (e) => {
            const slider = e.target;
            const newVol = parseFloat(slider.value);
            this.volumeValue.textContent = newVol.toFixed(1) + ' dB';
            this.callbacks.onVolumeChange(newVol);
        });
        // velocity-sensitive  drag
        this.modDepthSlider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startSliderDrag(this.modDepthSlider, e.clientX);
        });
        this.baseFreqSlider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startSliderDrag(this.baseFreqSlider, e.clientX);
        });
        document.addEventListener('mousemove', (e) => {
            if (this.sliderDragState.active) {
                e.preventDefault();
                this.updateSliderDrag(e.clientX);
            }
        });
        document.addEventListener('mouseup', () => {
            this.endSliderDrag();
        });
        // touch events for sliders
        this.modDepthSlider.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startSliderDrag(this.modDepthSlider, e.touches[0].clientX);
        });
        this.baseFreqSlider.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startSliderDrag(this.baseFreqSlider, e.touches[0].clientX);
        });
        document.addEventListener('touchmove', (e) => {
            if (this.sliderDragState.active) {
                e.preventDefault();
                this.updateSliderDrag(e.touches[0].clientX);
            }
        }, { passive: false });
        document.addEventListener('touchend', () => {
            this.endSliderDrag();
        });
        document.addEventListener('touchcancel', () => {
            this.endSliderDrag();
        });
        // Canvas drag events
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            // set initial position
            this.updatePosition(e.clientX, e.clientY);
        });
        // Listen for mouseup globally to catch releases outside canvas
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
        // Listen for mousemove globally to track cursor when dragging outside canvas
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.updatePosition(e.clientX, e.clientY);
            }
        });
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isDragging = true;
        });
        this.canvas.addEventListener('touchend', () => {
            this.isDragging = false;
        });
        this.canvas.addEventListener('touchcancel', () => {
            this.isDragging = false;
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.isDragging) {
                const touch = e.touches[0];
                this.updatePosition(touch.clientX, touch.clientY);
            }
        });
    }
    initializeDisplayValues() {
        // initialize display values to match actual slider positions (handles browser form state caching)
        this.modDepthValue.textContent = parseFloat(this.modDepthSlider.value).toFixed(3);
        this.baseFreqValue.textContent = parseFloat(this.baseFreqSlider.value) + ' Hz';
        this.volumeValue.textContent = parseFloat(this.volumeSlider.value).toFixed(1) + ' dB';
    }
    startSliderDrag(slider, clientX) {
        this.sliderDragState.active = true;
        this.sliderDragState.slider = slider;
        this.sliderDragState.lastX = clientX;
        this.sliderDragState.lastTime = performance.now();
        this.sliderDragState.currentValue = parseFloat(slider.value);
    }
    updateSliderDrag(clientX) {
        if (!this.sliderDragState.active || !this.sliderDragState.slider)
            return;
        const now = performance.now();
        const dt = now - this.sliderDragState.lastTime;
        const dx = clientX - this.sliderDragState.lastX;
        if (dt === 0)
            return;
        const velocity = Math.abs(dx) / dt;
        const slider = this.sliderDragState.slider;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const range = max - min;
        // Adaptive scaling: slow drag = fine, fast drag = coarse
        const minStep = range * 0.0001;
        const maxStep = range * 0.5;
        const velocityThreshold = 30; // px/ms where we want coarse control to kick in
        const velocityNorm = Math.min(0.1, Math.pow(velocity / velocityThreshold, 0.6));
        console.log('vel norm:', velocityNorm.toFixed(4));
        // convert dx to value change based on slider width
        const rect = slider.getBoundingClientRect();
        const pixelToValue = range / rect.width;
        const rawDelta = dx * pixelToValue;
        // scale the delta by velocity; faster drags get multiplied more
        const scaledDelta = rawDelta * (0.1 + velocityNorm * 12);
        const step = Math.max(minStep, Math.min(maxStep, Math.abs(scaledDelta)));
        const quantizedDelta = Math.sign(scaledDelta) * step;
        // update value
        let newValue = this.sliderDragState.currentValue + quantizedDelta;
        newValue = Math.max(min, Math.min(max, newValue));
        slider.value = newValue.toString();
        this.sliderDragState.currentValue = newValue;
        // trigger display update and synth parameter change
        slider.dispatchEvent(new Event('input'));
        this.sliderDragState.lastX = clientX;
        this.sliderDragState.lastTime = now;
    }
    endSliderDrag() {
        this.sliderDragState.active = false;
        this.sliderDragState.slider = null;
    }
    updatePosition(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;
        // store clipped cursor position
        this.cursorX = Math.max(0, Math.min(this.canvas.width, canvasX));
        this.cursorY = Math.max(0, Math.min(this.canvas.height, canvasY));
        // normalize to [0..1]
        const normX = canvasX / this.canvas.width;
        const normY = canvasY / this.canvas.height;
        // always update synth parameters (will take effect when audio starts if not running)
        this.callbacks.onAmplitudeUpdate(normX, normY);
    }
    draw() {
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // draw corner labels
        this.ctx.fillStyle = '#4a4a4a';
        this.ctx.font = '14px Courier New';
        this.ctx.fillText('Op1', 10, 20);
        this.ctx.fillText('Op2', this.canvas.width - 40, 20);
        this.ctx.fillText('Op3', 10, this.canvas.height - 10);
        this.ctx.fillText('Op4', this.canvas.width - 40, this.canvas.height - 10);
        // draw corner indicators with brightness based on amplitude
        const cornerSize = 60;
        this.drawCorner(0, 0, this.currentAmps[0]);
        this.drawCorner(this.canvas.width - cornerSize, 0, this.currentAmps[1]);
        this.drawCorner(0, this.canvas.height - cornerSize, this.currentAmps[2]);
        this.drawCorner(this.canvas.width - cornerSize, this.canvas.height - cornerSize, this.currentAmps[3]);
        // draw cursor position from stored state
        if (this.cursorX !== undefined && this.cursorY !== undefined) {
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.beginPath();
            this.ctx.arc(this.cursorX, this.cursorY, 8, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    drawCorner(x, y, amp) {
        const brightness = Math.floor(amp * 255);
        this.ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.3)`;
        this.ctx.fillRect(x, y, 60, 60);
    }
    startAudio() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.callbacks.onStartAudio();
        this.startBtn.textContent = 'Stop Audio';
        this.statusDisplay.textContent = 'Audio running - drag to control operators';
    }
    stopAudio() {
        if (!this.isRunning)
            return;
        this.isRunning = false;
        this.callbacks.onStopAudio();
        this.startBtn.textContent = 'Start Audio';
        this.statusDisplay.textContent = 'Audio stopped - click Start to resume';
    }
    updateAmplitudes(amps) {
        this.currentAmps = amps;
    }
    getIsRunning() {
        return this.isRunning;
    }
}
//# sourceMappingURL=drone-gui.js.map