import { describe, expect, it } from 'vitest';
import {
  normalizeStructuredSimulationSpec,
  renderStructuredSimulationHtml,
} from '@openmaic/generation';

describe('structured simulation', () => {
  const rawSpec = {
    type: 'simulation',
    version: 1,
    title: 'Disk usage growth',
    description: 'A deterministic teaching model for disk growth.',
    primaryVariable: 'used',
    variables: [
      {
        id: 'used',
        label: 'Used disk',
        min: 0,
        max: 100,
        default: 10,
        step: 1,
        unit: '%',
        ratePerSecond: 5,
        boundary: 'clamp',
      },
      {
        id: 'writeRate',
        label: 'Write rate',
        min: 0,
        max: 50,
        default: 5,
        step: 1,
        unit: 'MB/s',
        ratePerSecond: 0,
        boundary: 'clamp',
      },
    ],
    presets: [{ name: 'Fast growth', values: { used: 70, writeRate: 30 } }],
    ui: {
      controlsTitle: 'Controls',
      presetsTitle: 'Presets',
      start: 'Start',
      pause: 'Pause',
      resume: 'Resume',
      reset: 'Reset',
      restart: 'Restart',
      ready: 'Ready',
      running: 'Running',
      paused: 'Paused',
      ended: 'Ended',
    },
  };

  it('normalizes a valid spec and renders a fixed runtime shell', () => {
    const spec = normalizeStructuredSimulationSpec(rawSpec);
    expect(spec).not.toBeNull();
    if (!spec) return;

    const html = renderStructuredSimulationHtml(spec);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('structured-simulation-v1');
    expect(html).toContain('requestAnimationFrame');
    expect(html).toContain('cancelAnimationFrame');
    expect(html).toContain('id="used-slider"');
    expect(html).toContain('id="reset-btn"');
    expect(html).toContain('SET_WIDGET_STATE');
  });

  it('rejects specs with no dynamic variable', () => {
    const invalid = {
      ...rawSpec,
      variables: rawSpec.variables.map((variable) => ({ ...variable, ratePerSecond: 0 })),
    };
    expect(normalizeStructuredSimulationSpec(invalid)).toBeNull();
  });

  it('rejects duplicate or unsafe variable ids', () => {
    const invalid = {
      ...rawSpec,
      variables: [
        rawSpec.variables[0],
        { ...rawSpec.variables[1], id: 'used' },
      ],
    };
    expect(normalizeStructuredSimulationSpec(invalid)).toBeNull();

    const unsafe = {
      ...rawSpec,
      variables: [{ ...rawSpec.variables[0], id: 'used"><script' }],
    };
    expect(normalizeStructuredSimulationSpec(unsafe)).toBeNull();
  });

  it('clamps preset values into each variable range', () => {
    const spec = normalizeStructuredSimulationSpec({
      ...rawSpec,
      presets: [{ name: 'Extreme', values: { used: 999, writeRate: -10 } }],
    });
    expect(spec?.presets[0].values).toEqual({ used: 100, writeRate: 0 });
  });
});
