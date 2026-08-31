type ExportRunner = <T>(fn: () => Promise<T>) => Promise<T>;

// html2canvas rasterizes by cloning the DOM into a transient same-origin <iframe>.
// The data-app sandbox guards <iframe> creation, so it installs a grant that lets
// the chart export create it (safely — the sandbox collapses that iframe's realm to
// its own gated realm). Everywhere else this is a pass-through.
//
// Kept in its own dependency-free module so the sandbox can wire the grant without
// importing `save-chart-image` — which would pull the chart-export/branding chain
// (including a `.svg?component` import) into the published SDK-package bundle.
let runner: ExportRunner = (fn) => fn();

export const setChartExportIframeGrant = (nextRunner: ExportRunner) => {
  runner = nextRunner;
};

export const runWithinExportGrant: ExportRunner = (fn) => runner(fn);
