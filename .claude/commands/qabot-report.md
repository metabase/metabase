Regenerate the QA report from existing review files.

## Instructions

1. **Find the latest qabot output**: Look in `.bot/qabot/` for the most recent timestamp directory that contains `initial-review-results.md` and/or `ux-review.md`.

2. **Gather environment info**:
   - `./bin/mage -bot-git-readonly git branch --show-current` — branch name
   - `./bin/mage -bot-git-readonly git rev-parse --short HEAD` — commit hash
   - Current date

3. **Regenerate the report**: Follow the Phase 5 instructions from the qabot agent prompt:
   - Read `initial-review-results.md` and `ux-review.md`
   - Generate `report.md` with findings grouped by severity (SECURITY > SEVERE > GOOD TO FIX > TRIVIAL)
   - Non-TRIVIAL: full detail with inline screenshots and evidence
   - TRIVIAL: 1-sentence description with file reference

4. **Generate PDF**:
   ```bash
   cd <report-directory> && pandoc report.md -o report.pdf --pdf-engine=weasyprint
   ```

5. **Present results**: Show absolute paths to both report.md and report.pdf.
