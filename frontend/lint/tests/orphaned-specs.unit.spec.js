import {
  diffKnown,
  findOrphanedSpecs,
  formatFinding,
  listSpecFiles,
} from "../scripts/orphaned-specs";

// A spec named after a file that is not beside it keeps passing while its subject lives elsewhere,
// so a move or rename quietly leaves the tests behind.
// This scan fails the spec whose name claims a subject that does not exist,
// and the fix is to move the spec with its code or give it a behaviour name in a tests/ directory.
describe("orphaned specs", () => {
  const findings = findOrphanedSpecs();

  it("scans the spec tree", () => {
    expect(listSpecFiles().length).toBeGreaterThan(1000);
  });

  it("finds no orphaned spec outside the known list", () => {
    const { unlisted } = diffKnown(findings);
    expect(unlisted.map(formatFinding)).toEqual([]);
  });

  it("finds every spec still on the known list, so the list only shrinks", () => {
    const { fixed } = diffKnown(findings);
    expect(
      fixed.map(
        (spec) =>
          `${spec} is no longer orphaned: delete its entry from KNOWN_ORPHANED_SPECS in frontend/lint/scripts/orphaned-specs.js`,
      ),
    ).toEqual([]);
  });
});
