Create a simulation widget for: {{conceptName}}

## Concept Overview

{{conceptOverview}}

## Key Points

{{keyPoints}}

## Variables to Expose

{{variables}}

## Design Idea

{{designIdea}}

## Language

{{languageDirective}}

---

Generate a complete, interactive HTML simulation with these MANDATORY features:

### Structure
1. **UTF-8 HTML5 document** with `<meta charset="utf-8">` inside `<head>`
2. **Embedded JSON config** in `<script type="application/json" id="widget-config">`
3. **Control panel** with sliders for each variable
4. **Canvas visualization** with proper sizing
5. **Preset buttons** for common scenarios

### Language & Text Integrity (CRITICAL)
1. Follow `{{languageDirective}}` consistently for every learner-facing label, title, hint, status and button
2. Do NOT mix characters from unrelated writing systems unless the lesson itself requires them
3. Keep all source text as valid UTF-8; never transliterate Chinese text into look-alike Latin or other-script glyphs
4. Do NOT depend on external web fonts or icon-font CDNs. Use a system font stack with CJK fallbacks such as `Inter, "Noto Sans SC", "PingFang SC", "PingFang TC", "Microsoft YaHei", "Microsoft JhengHei", system-ui, sans-serif`
5. Before output, reread every visible string and verify that it is semantically intact in the requested language

### Mobile Responsiveness (CRITICAL)
1. **Control panel MUST NOT overlap canvas on mobile**
2. Use `flex-col md:flex-row` layout with proper spacing
3. Control panel: `max-h-[40vh] md:max-h-screen` with overflow scroll
4. Canvas container: `min-h-[300px]` to ensure visibility
5. Touch-friendly controls (44px minimum touch targets)

### Runtime Reliability (CRITICAL)
1. Use ONE explicit state object as the source of truth; displays, canvas/SVG and controls must all derive from that same state
2. Register event listeners exactly once, after the referenced DOM elements exist
3. Starting the simulation MUST change at least one obvious visible value or visual state immediately; time-based simulations should use one `requestAnimationFrame` loop with a real elapsed-time delta
4. Repeated Start/Resume clicks MUST NOT create duplicate animation loops or duplicate timers
5. Pause MUST stop progression without destroying state; Reset MUST cancel active loops/timers and restore every state variable, control value and display to the exact initial state
6. Every slider, preset and button must update state AND trigger the same render/update path used by the simulation loop
7. Every numeric readout must be computed from current state rather than maintained as a disconnected counter
8. Do not infer behavior from button text. Branch on explicit state values only
9. Before output, mentally execute this full sequence and fix any broken transition: `load → start → pause → resume → change slider → apply preset → reset → start again`

### Button Logic (CRITICAL)
1. **Main button MUST handle all states correctly:**
   - "启动" → Starts simulation
   - "暂停" → Pauses running simulation
   - "重新开始" → Resets to initial state, then starts fresh
2. **Reset function MUST reset ALL state variables** (position, velocity, time, etc.)
3. Use clear state tracking: `{ running: boolean, ended: boolean, paused: boolean }`

### Canvas
1. Auto-resize on window resize
2. Clear visualization with grid or guides
3. Real-time data display overlay
4. Proper scaling for different screen sizes

### Interactivity
1. Real-time updates when sliders change
2. Presets apply and reset simulation
3. Keyboard shortcuts (Space = toggle, R = reset)
4. Touch gestures for mobile

### Visual Polish
1. Show current simulation state (running/paused/ended)
2. Animate transitions
3. Clear feedback when simulation ends
4. High contrast colors for visibility