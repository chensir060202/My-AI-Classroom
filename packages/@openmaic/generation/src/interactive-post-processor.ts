import {
  normalizeStructuredSimulationSpec,
  renderStructuredSimulationHtml,
} from './structured-simulation.js';

/**
 * Interactive HTML Post-Processor
 *
 * Handles two paths:
 * - Structured simulation envelope -> deterministic host renderer
 * - Legacy generated HTML -> LaTeX conversion + KaTeX injection
 */
export function postProcessInteractiveHtml(html: string): string {
  const structuredSpec = extractStructuredSimulationSpec(html);
  if (structuredSpec !== null) {
    const normalized = normalizeStructuredSimulationSpec(structuredSpec);
    if (normalized) {
      return renderStructuredSimulationHtml(normalized);
    }
  }

  // Legacy compatibility path. If the structured contract is absent or invalid,
  // keep the model-generated HTML instead of making the scene unusable.
  let processed = convertLatexDelimiters(html);

  if (!processed.toLowerCase().includes('katex')) {
    processed = injectKatex(processed);
  }

  return processed;
}

function extractStructuredSimulationSpec(html: string): unknown | null {
  const match = html.match(
    /<script\s+type=["']application\/json["']\s+id=["']structured-simulation-spec["']\s*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Convert LaTeX delimiters while protecting <script> tags.
 *
 * - Protects script blocks from modification
 * - Converts $$...$$ to \[...\] (display math)
 * - Converts $...$ to \(...\) (inline math)
 * - Restores script blocks after conversion
 */
function convertLatexDelimiters(html: string): string {
  const scriptBlocks: string[] = [];

  let processed = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    scriptBlocks.push(match);
    return `__SCRIPT_BLOCK_${scriptBlocks.length - 1}__`;
  });

  processed = processed.replace(/\$\$([^$]+)\$\$/g, '\\[$1\\]');
  processed = processed.replace(/\$([^$\n]+?)\$/g, '\\($1\\)');

  processed = processed.replace(
    /__SCRIPT_BLOCK_(\d+)__/g,
    (whole, index) => scriptBlocks[Number(index)] ?? whole,
  );

  return processed;
}

/** Inject KaTeX CSS/JS and auto-render support into legacy generated HTML. */
function injectKatex(html: string): string {
  const katexInjection = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function() {
    const katexOptions = {
        delimiters: [
            {left: '\\\\[', right: '\\\\]', display: true},
            {left: '\\\\(', right: '\\\\)', display: false},
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
        ],
        throwOnError: false,
        strict: false,
        trust: true
    };

    let renderTimeout;
    function safeRender() {
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            renderMathInElement(document.body, katexOptions);
        }, 100);
    }

    renderMathInElement(document.body, katexOptions);

    const observer = new MutationObserver((mutations) => {
        let shouldRender = false;
        mutations.forEach((mutation) => {
            if (mutation.target &&
                mutation.target.className &&
                typeof mutation.target.className === 'string' &&
                mutation.target.className.includes('katex')) {
                return;
            }
            shouldRender = true;
        });

        if (shouldRender) {
            safeRender();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    setInterval(() => {
        const text = document.body.innerText;
        if (text.includes('\\\\(') || text.includes('$$')) {
            safeRender();
        }
    }, 2000);
});
</script>`;

  const headCloseIdx = html.indexOf('</head>');
  if (headCloseIdx !== -1) {
    return (
      html.substring(0, headCloseIdx) +
      katexInjection +
      '\n</head>' +
      html.substring(headCloseIdx + 7)
    );
  }

  const bodyCloseIdx = html.indexOf('</body>');
  if (bodyCloseIdx !== -1) {
    return (
      html.substring(0, bodyCloseIdx) +
      katexInjection +
      '\n</body>' +
      html.substring(bodyCloseIdx + 7)
    );
  }

  return html + katexInjection;
}
