#!/usr/bin/env python3
"""Inventory Collegiate Python notebooks for Metabase conversion.

The script is intentionally read-only. It parses valid `.ipynb` JSON files,
extracts source file references, likely visualization cells, and commonly
referenced columns, then writes a detailed JSON inventory to /private/tmp.
"""

from __future__ import annotations

import json
import pathlib
import re
from collections import Counter


NOTEBOOK_DIR = pathlib.Path(
    "/Users/kurtishmistry/Documents/Collegiate-Python-Notebooks"
)
OUTPUT_PATH = pathlib.Path("/private/tmp/collegiate_notebook_inventory.json")

CHART_MARKERS = re.compile(
    r"(plt\.|sns\.|\.plot\(|fig\.|ax\.|display\(|Styler|style\.|bar\(|plot\()",
    re.IGNORECASE,
)
FILE_REF = re.compile(r"[\"']([^\"']+\.(?:csv|xlsx|xls|json|parquet))[\"']", re.I)
COLUMN_REF = re.compile(r"\[\s*[\"']([^\"']+)[\"']\s*\]")
IMPORT_REF = re.compile(
    r"^(?:import\s+[^\n]+|from\s+[^\n]+\s+import\s+[^\n]+)", re.MULTILINE
)


def read_notebook(path: pathlib.Path) -> dict | None:
    try:
        notebook = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return notebook if isinstance(notebook.get("cells"), list) else None


def cell_source(cell: dict) -> str:
    return "".join(cell.get("source", []))


def inventory_notebook(path: pathlib.Path, notebook: dict) -> dict:
    current_section = "(initial setup)"
    files: Counter[str] = Counter()
    columns: Counter[str] = Counter()
    imports: Counter[str] = Counter()
    sections = []

    cells = notebook["cells"]
    for index, cell in enumerate(cells):
        source = cell_source(cell)

        if cell.get("cell_type") == "markdown":
            headings = [
                line.strip().lstrip("#").strip()
                for line in source.splitlines()
                if line.strip().startswith("#")
            ]
            if headings:
                current_section = headings[0]
            elif source.strip():
                current_section = " ".join(source.strip().split())[:80]
            continue

        if cell.get("cell_type") != "code":
            continue

        for match in IMPORT_REF.finditer(source):
            imports[match.group(0).strip()] += 1

        for match in FILE_REF.finditer(source):
            files[match.group(1)] += 1

        for match in COLUMN_REF.finditer(source):
            column = match.group(1)
            if len(column) < 80 and not column.lower().endswith((".csv", ".xlsx", ".xls")):
                columns[column] += 1

        has_chart = bool(CHART_MARKERS.search(source))
        has_read = "read_csv" in source or "read_excel" in source

        if has_chart or has_read or len(source) > 2500:
            sections.append(
                {
                    "cell": index,
                    "section": current_section,
                    "chars": len(source),
                    "has_chart": has_chart,
                    "has_read": has_read,
                    "files": sorted(set(FILE_REF.findall(source))),
                    "columns": [
                        column
                        for column, _ in Counter(COLUMN_REF.findall(source)).most_common(30)
                        if len(column) < 80
                    ],
                }
            )

    return {
        "notebook": path.name,
        "size_bytes": path.stat().st_size,
        "cells": len(cells),
        "code_cells": sum(1 for cell in cells if cell.get("cell_type") == "code"),
        "markdown_cells": sum(
            1 for cell in cells if cell.get("cell_type") == "markdown"
        ),
        "files": dict(files.most_common()),
        "columns": dict(columns.most_common(80)),
        "imports": dict(imports.most_common(20)),
        "sections": sections,
    }


def main() -> None:
    inventory = []
    skipped = []

    for path in sorted(NOTEBOOK_DIR.glob("*.ipynb")):
        notebook = read_notebook(path)
        if notebook is None:
            skipped.append(path.name)
            continue
        inventory.append(inventory_notebook(path, notebook))

    OUTPUT_PATH.write_text(json.dumps(inventory, indent=2), encoding="utf-8")

    print(f"Wrote {OUTPUT_PATH}")
    print(f"Readable notebooks: {len(inventory)}")
    print(f"Skipped notebooks: {len(skipped)}")
    for notebook in inventory:
        print(
            f"- {notebook['notebook']}: "
            f"{notebook['cells']} cells, {len(notebook['sections'])} conversion cells"
        )
    if skipped:
        print("Skipped:")
        for name in skipped:
            print(f"- {name}")


if __name__ == "__main__":
    main()
