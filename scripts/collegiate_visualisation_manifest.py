#!/usr/bin/env python3
"""Build a conversion manifest for Collegiate notebook visualisations.

The manifest is the handoff contract between the Python-notebook conversion
work and the Metabase import work. It records each rendered notebook visual,
the source cell that produced it, likely input files, referenced columns, and
placeholder fields for Metabase card/dashboard details.
"""

from __future__ import annotations

import base64
import csv
import json
import os
import pathlib
import re
from collections import Counter


NOTEBOOK_DIR = pathlib.Path(
    os.environ.get(
        "NOTEBOOK_DIR",
        "/Users/kurtishmistry/Documents/Collegiate-Python-Notebooks",
    )
)
OUTPUT_JSON = pathlib.Path(
    os.environ.get(
        "OUTPUT_JSON",
        "/private/tmp/collegiate_visualisation_manifest.json",
    )
)
OUTPUT_CSV = pathlib.Path(
    os.environ.get(
        "OUTPUT_CSV",
        "/private/tmp/collegiate_visualisation_manifest.csv",
    )
)
IMAGE_DIR = pathlib.Path(
    os.environ.get(
        "IMAGE_DIR",
        "/private/tmp/collegiate_visualisation_gallery/images",
    )
)

FILE_REF = re.compile(r"[\"']([^\"']+\.(?:csv|xlsx|xls|json|parquet))[\"']", re.I)
COLUMN_REF = re.compile(r"\[\s*[\"']([^\"']+)[\"']\s*\]")
TITLE_PATTERNS = [
    re.compile(pattern, re.I)
    for pattern in [
        r"\.suptitle\(\s*['\"]([^'\"]+)['\"]",
        r"\.set_title\(\s*['\"]([^'\"]+)['\"]",
        r"\.title\(\s*['\"]([^'\"]+)['\"]",
        r"title\s*=\s*['\"]([^'\"]+)['\"]",
    ]
]


def clean_source(source: list[str] | str) -> str:
    if isinstance(source, list):
        return "".join(source)
    return source or ""


def notebook_slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", pathlib.Path(name).stem).strip("-").lower()


def first_markdown_heading(cells: list[dict], cell_index: int) -> str:
    for previous in range(cell_index - 1, -1, -1):
        cell = cells[previous]
        if cell.get("cell_type") != "markdown":
            continue
        source = clean_source(cell.get("source", ""))
        headings = re.findall(r"^#{1,4}\s+(.+)$", source, flags=re.MULTILINE)
        if headings:
            return headings[-1].strip()
    return "Unsectioned"


def infer_title(source: str, fallback: str) -> str:
    for pattern in TITLE_PATTERNS:
        match = pattern.search(source)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip()

    comments = [
        line.strip("# ").strip()
        for line in source.splitlines()
        if line.strip().startswith("#") and len(line.strip("# ").strip()) > 8
    ]
    if comments:
        return comments[0]
    return fallback


def image_name_for(notebook_name: str, cell_index: int, output_index: int) -> str:
    return (
        f"{notebook_slug(notebook_name)}-cell-{cell_index:03d}"
        f"-output-{output_index:02d}.png"
    )


def extract_visuals(path: pathlib.Path) -> list[dict]:
    notebook = json.loads(path.read_text(encoding="utf-8"))
    cells = notebook.get("cells", [])
    visuals = []

    for zero_based_cell_index, cell in enumerate(cells):
        if cell.get("cell_type") != "code":
            continue

        source = clean_source(cell.get("source", ""))
        files = sorted(set(FILE_REF.findall(source)))
        columns = [
            column
            for column, _ in Counter(COLUMN_REF.findall(source)).most_common(50)
            if len(column) < 80 and not column.lower().endswith((".csv", ".xlsx", ".xls"))
        ]

        image_count_for_cell = 0
        for one_based_output_index, output in enumerate(cell.get("outputs", []), start=1):
            png = output.get("data", {}).get("image/png")
            if not png:
                continue

            one_based_cell_index = zero_based_cell_index + 1
            image_count_for_cell += 1
            image_name = image_name_for(
                path.name,
                one_based_cell_index,
                one_based_output_index,
            )
            image_path = IMAGE_DIR / image_name

            if not image_path.exists():
                image_path.parent.mkdir(parents=True, exist_ok=True)
                image_path.write_bytes(base64.b64decode(png))

            section = first_markdown_heading(cells, zero_based_cell_index)
            title = infer_title(source, f"{section} visual {image_count_for_cell}")

            visuals.append(
                {
                    "status": "todo",
                    "notebook": path.stem,
                    "section": section,
                    "title": title,
                    "cell_index": one_based_cell_index,
                    "output_index": one_based_output_index,
                    "image_path": str(image_path),
                    "image_file_url": image_path.resolve().as_uri(),
                    "image_relative_path": str(
                        pathlib.Path("collegiate_visualisation_gallery/images")
                        / image_name
                    ),
                    "source_files": files,
                    "columns": columns,
                    "source_code": source,
                    "metabase_collection": path.stem,
                    "metabase_dashboard": f"{path.stem} Dashboard",
                    "metabase_card_name": title,
                    "metabase_database_id": "",
                    "metabase_sql": "",
                    "metabase_visualization": "",
                    "notes": "",
                }
            )

    return visuals


def write_csv(rows: list[dict]) -> None:
    fields = [
        "status",
        "notebook",
        "section",
        "title",
        "cell_index",
        "output_index",
        "image_path",
        "source_files",
        "columns",
        "metabase_collection",
        "metabase_dashboard",
        "metabase_card_name",
        "metabase_database_id",
        "metabase_sql",
        "metabase_visualization",
        "notes",
    ]
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    field: json.dumps(row[field], ensure_ascii=False)
                    if isinstance(row.get(field), list)
                    else row.get(field, "")
                    for field in fields
                }
            )


def main() -> int:
    rows = []
    for path in sorted(NOTEBOOK_DIR.glob("*.ipynb")):
        rows.extend(extract_visuals(path))

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(
        json.dumps(rows, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_csv(rows)

    print(f"Wrote {OUTPUT_JSON}")
    print(f"Wrote {OUTPUT_CSV}")
    print(f"Visualisations: {len(rows)}")
    for notebook, count in Counter(row["notebook"] for row in rows).most_common():
        print(f"- {notebook}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
