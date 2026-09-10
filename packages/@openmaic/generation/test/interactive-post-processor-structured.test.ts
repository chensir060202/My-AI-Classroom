import { describe, expect, it } from 'vitest';
import { postProcessInteractiveHtml } from '@openmaic/generation';

const validEnvelope = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script type="application/json" id="structured-simulation-spec">
{
  "type": "simulation",
  "version": 1,
  "title": "磁碟空間增長",
  "description": "觀察日誌持續寫入時磁碟使用量的變化。",
  "primaryVariable": "diskUsed",
  "variables": [
    {
      "id": "diskUsed",
      "label": "已使用空間",
      "min": 0,
      "max": 1000,
      "default": 0,
      "step": 1,
      "unit": "MB",
      "ratePerSecond": 50,
      "boundary": "clamp"
    }
  ],
  "presets": [
    { "name": "快速增長", "values": { "diskUsed": 250 } }
  ],
  "ui": {
    "controlsTitle": "控制",
    "presetsTitle": "情境",
    "start": "開始",
    "pause": "暫停",
    "resume": "繼續",
    "reset": "重置",
    "restart": "重新開始",
    "ready": "準備",
    "running": "運行中",
    "paused": "已暫停",
    "ended": "已完成"
  }
}
</script>
</body>
</html>`;

describe('postProcessInteractiveHtml structured simulation routing', () => {
  it('replaces a valid structured envelope with the deterministic renderer', () => {
    const output = postProcessInteractiveHtml(validEnvelope);

    expect(output).toContain('structured-simulation-v1');
    expect(output).toContain('simulation-canvas');
    expect(output).toContain('requestAnimationFrame');
    expect(output).toContain('磁碟空間增長');
    expect(output).not.toContain('cdn.jsdelivr.net/npm/katex');
  });

  it('falls back to the legacy post-processor when the structured spec is invalid', () => {
    const invalid = `<!DOCTYPE html><html><head></head><body><script type="application/json" id="structured-simulation-spec">{"type":"simulation","version":1}</script><p>$x$</p></body></html>`;
    const output = postProcessInteractiveHtml(invalid);

    expect(output).toContain('cdn.jsdelivr.net/npm/katex');
    expect(output).toContain('\\(x\\)');
    expect(output).toContain('structured-simulation-spec');
  });
});
