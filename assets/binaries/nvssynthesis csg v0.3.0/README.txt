This is the Universal build for MacOS. 

In this folder, you will find:
csg.vst3
csg.component
csg.app (standalone)
README.txt
INSTALLATION GUIDE.txt

================================================================================================================

Thank you for downloading the nvssynthesis csg, a.k.a. Curl and Skew Generator! csg is a monophonic synthesizer with an experimental chaotic feedback architecture, optimized for fast creation of noise, drones, skronks, squirgles, and scroans. 

The basic signal path can be conceived of by looking at the panel, left to right, top to bottom.

There is an Frequency Modulation (FM) section (which will give you FM that does NOT sound anything like the tones associated with the famous Japanese series of FM synths), a Phase Modulation (PM) section (which behaves more like digital low-res West-Coast wavefolding), and Filter section (which uses a chaotic state-variable filter), and a moderately driven amplifier controlled by an ASR envelope. The amplifier also features the ability to drone, a feature common to DIY and noise synths but lost on many fancy 'flagship' synthesizers.

Most of the parameters interact with each other in a complex manner, leading to unpredictable, chaotic sounds.

Parameters:
SELF-FM: how much the oscillator modulates its own frequency. This modulation path is post-some-other-shaping, so it usually gives unexpected results.
MEMORY: how long in the past the SELF-FM is remembering.
FM_SMOOTH: a simple lowpass filter affecting ONLY the FM feedback path
FM_DEGRADE: a pseudo-bitcrusher affecting at the output of the FM section. Inevitably, it also affects the character of the FM feedback in a detrimental way, NOT how you might expect!

PM_AMOUNT: how much phase modulation is applied
PM_TAME: a simple lowpass filter for the phase modulation section
PM_SHAPE: a phase offset (0 to 90 degrees) for the phase modulation
PM_DEGRADE: a pseudo-bitcrusher for the phase modulation section. THIS WON'T DO the same thing as simply adding a bitcrusher after the plugin!

DRIVE: how much to drive into the filter. Higher drive gives more chaotic and saturated character. Very low drive values behave more linearly. Low values also will currently sound louder due to the current gain compensation meachanism.
CUTOFF: what do you expect? it's the filter cutoff frequency, of course.
RESO: filter resonance, of course. BUT IT'S WEIRD!!!
TYPE_L: left channel filter type, discretely chosen between lowpass, bandpass, highpass, and notch
TYPE_R: right channel filter type, discretely chosen between lowpass, bandpass, highpass, and notch

LFO_RATE: the lfo frequency
LFO_WAVE: the lfo waveform, continuously variable from sine -> saw -> square -> triangle

DRONE: at 0, the sound is only hear when triggered via MIDI (via the ASR envelope), at 1, the sound is alway fully heard and the ASR envelope has no effect; in between these extremes, you hear proportionally the droning synth and the envelope affecting volume.
RISE: the rise time of the amplitude envelope
FALL: the fall time of the amplitude envelope

On the very top there are some utility controls: the filter oversampling amount (which affects the resonance quality; higher is more accurate, but lower can sometimes sound cooler), and output gain knob.

================================================================================================================

All of the plugin's parameters are set up with a 'base value' (controlled via vertical slider) and a 'modulation amount' (controlled via the rotary dial below each slider).

The modulation amount controls the degree to which the built in LFO modulates the given parameter.

At this stage of development, some of the parameters are not modulatable, even though they have modulation knobs:
-MEMORY
-TYPE_L and TYPE_R
-LFO_RATE
-LFO_WAVE
-DRONE
-RISE
-FALL

These are on the TODO list, as is adding more modulation sources.
