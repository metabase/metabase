const SNAPSHOTS_DIR = "e2e/visual-snapshots";

function toBinaryString(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

interface CompareImagesResult {
  numDiffPixels: number;
  totalPixels: number;
  diffPercentage: number;
  match: boolean;
}

interface CompareOptions {
  /** Per-pixel matching threshold (0 to 1). Smaller = more sensitive. Default 0.1 */
  threshold?: number;
  /** Max percentage of pixels that can differ (0 to 100). Default 0 (exact match) */
  maxDiffPercentage?: number;
}

/**
 * Compare a canvas element against a stored reference snapshot using pixelmatch.
 * Run with `CYPRESS_UPDATE_SNAPSHOTS=true` to generate/update reference snapshots.
 *
 * @param canvas - The canvas element to compare
 * @param snapshotName - Name for the snapshot file (without extension)
 * @param options - Comparison options (threshold, maxDiffPercentage)
 */
export function compareCanvasSnapshot(
  canvas: HTMLCanvasElement,
  snapshotName: string,
  options: CompareOptions = {},
) {
  const { threshold = 0.1, maxDiffPercentage = 0 } = options;
  const snapshotPath = `${SNAPSHOTS_DIR}/${snapshotName}.png`;
  const actualPath = `${SNAPSHOTS_DIR}/${snapshotName}.actual.png`;
  const diffPath = `${SNAPSHOTS_DIR}/${snapshotName}.diff.png`;

  cy.wrap(null, { log: false })
    .then(() => {
      return new Cypress.Promise<string>((resolve) => {
        canvas.toBlob((blob) => {
          blob!.arrayBuffer().then((buffer) => {
            resolve(toBinaryString(new Uint8Array(buffer)));
          });
        }, "image/png");
      });
    })
    .then((imageData) => {
      if (Cypress.env("UPDATE_SNAPSHOTS")) {
        cy.writeFile(snapshotPath, imageData, "binary");
        cy.log(`Updated snapshot: ${snapshotName}`);
      } else {
        // Write actual image for comparison, then compare
        cy.writeFile(actualPath, imageData, "binary", { log: false }).then(
          () => {
            // Get absolute paths for the Node.js task
            const projectRoot = Cypress.config("projectRoot");
            const absActualPath = `${projectRoot}/${actualPath}`;
            const absExpectedPath = `${projectRoot}/${snapshotPath}`;
            const absDiffPath = `${projectRoot}/${diffPath}`;

            cy.task<CompareImagesResult>("compareImages", {
              actualPath: absActualPath,
              expectedPath: absExpectedPath,
              diffPath: absDiffPath,
              threshold,
              maxDiffPercentage,
            }).then((result) => {
              if (result.match) {
                // Clean up actual and diff files on success
                cy.task("removeFile", absActualPath, { log: false });
                cy.task("removeFile", absDiffPath, { log: false });
              } else {
                cy.log(
                  `Snapshot mismatch! ${result.numDiffPixels} pixels differ (${result.diffPercentage.toFixed(2)}%)`,
                );
                cy.log(`Actual: ${actualPath}`);
                cy.log(`Diff: ${diffPath}`);
              }
              expect(result.match).to.equal(
                true,
                `Snapshot "${snapshotName}" should match. ${result.numDiffPixels} pixels differ (${result.diffPercentage.toFixed(2)}%). Run with CYPRESS_UPDATE_SNAPSHOTS=true to update.`,
              );
            });
          },
        );
      }
    });
}
