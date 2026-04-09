## PDF Report Generation

Use relative paths for images (`![desc](output/screenshot.png)`). Generate PDF from the report directory:
```bash
cd <report-directory> && npx -y md-to-pdf report.md
```
For large API responses (>100 lines), save to `output/` and reference the filename. Report absolute paths to both `.md` and `.pdf` files.
