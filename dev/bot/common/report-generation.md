## PDF Report Generation

Generate PDF reports from markdown using pandoc and weasyprint.

### Steps

1. **Write the markdown report** to the target directory (e.g., `.qabot/<branch>/<timestamp>/report.md`).

2. **Use relative paths for screenshots and output files** within the markdown. Reference images like `![description](output/screenshot-name.png)` — relative to the markdown file's directory.

3. **Generate the PDF** by running pandoc from the directory containing the markdown file:
   ```bash
   cd <report-directory> && pandoc report.md -o report.pdf --pdf-engine=weasyprint
   ```
   Running from the report directory ensures relative image paths resolve correctly.

4. **For large API responses** (>100 lines): do not inline them in the report. Instead, save them to the `output/` directory and reference the filename: "See `output/api-response-xyz.json` for full response."

5. **Report the absolute path** to both the markdown and PDF files so the user can open them directly.

### Troubleshooting

- If weasyprint fails on image paths, verify you're running pandoc from the correct directory
- If images don't appear in the PDF, check that the relative paths in the markdown match the actual file locations
- For very large reports, consider splitting into sections with page breaks: `<div style="page-break-after: always;"></div>`
