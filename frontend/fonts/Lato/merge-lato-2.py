#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools==4.68.0", "brotli==1.2.1"]
# ///
"""
Builds the three Lato woff2 files in this directory.

The bundled Lato is release 1.104, which is latin only. Greek, Cyrillic and the
symbol blocks arrived in release 2.x, which also re-spaced the family. Each file
here is the 1.104 face plus the codepoints it lacks from 2.015, with the 1.104
vertical metrics. Latin text then renders exactly as it did.

    ./merge-lato-2.py           write the three files
    ./merge-lato-2.py --check   fail if the committed files are not what this builds

The check compares font tables, not file bytes: woff2 compression can differ
between machines, the tables cannot.
"""

import hashlib
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

HERE = Path(__file__).parent

# The last commit that holds the 1.104 files under these names.
BASE_COMMIT = "084ad2d7d52c780b0b4403714b2ee06bdeaa9d23"
BASE_PATH = "frontend/fonts/Lato"

# google/fonts carries the full 2.015 release. The Fonts CSS API serves latin only.
DONOR_URL = "https://raw.githubusercontent.com/google/fonts/f3b885d5590e307e02542f1a724cec55d567fdaa/ofl/lato"

# `created` is the `head` timestamp of the committed file, in seconds since 1904.
# A merge stamps the current time, so it is pinned to keep the output stable.
WEIGHTS = [
    {
        "file": "lato-v16-latin-regular.woff2",
        "base_sha256": "c3c0d3f472358aac78455515c4800771426770c22698e2486d39fdb5505634e1",
        "donor": "Lato-Regular.ttf",
        "donor_sha256": "d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251",
        "created": 3874283630,
        "modified": 3874283630,
    },
    {
        "file": "lato-v16-latin-700.woff2",
        "base_sha256": "ca628784b961ca79f3184b978fff7733191bcd67846f6a162250fac8a0d7b486",
        "donor": "Lato-Bold.ttf",
        "donor_sha256": "8a0aace75d33794eece4b28187bfc1df0bbd2888b5d8a56e01788c8d65d16be1",
        "created": 3874283632,
        "modified": 3874283632,
    },
    {
        "file": "lato-v16-latin-900.woff2",
        "base_sha256": "7d4243c8e973ec0cfc707904891ae4e3efc03dbc8923acb9755f9a35c92269a6",
        "donor": "Lato-Black.ttf",
        "donor_sha256": "808c62839c62dbce7de689af7603666fc7f8b81e0df537d8a5212c87580d4337",
        "created": 3874283634,
        "modified": 3874283635,
    },
]

# A browser builds its line boxes from these. The merge widens them to fit the
# donor's taller accented glyphs, which would move every line of latin text.
TABLES_KEPT_FROM_BASE = ["OS/2", "hhea"]


def verified(data, sha256, what):
    actual = hashlib.sha256(data).hexdigest()
    if actual != sha256:
        sys.exit(f"{what}: sha256 is {actual}, expected {sha256}")
    return data


def base_bytes(weight):
    shown = subprocess.run(
        ["git", "show", f"{BASE_COMMIT}:{BASE_PATH}/{weight['file']}"],
        capture_output=True,
        check=True,
    )
    return verified(shown.stdout, weight["base_sha256"], f"1.104 {weight['file']}")


def donor_bytes(weight):
    with urllib.request.urlopen(f"{DONOR_URL}/{weight['donor']}") as response:
        return verified(response.read(), weight["donor_sha256"], weight["donor"])


def merged(weight, work_dir):
    base_path = work_dir / "base.ttf"
    donor_path = work_dir / "donor.ttf"
    base_woff2_path = work_dir / "base.woff2"
    base_woff2_path.write_bytes(base_bytes(weight))
    donor_path.write_bytes(donor_bytes(weight))

    base = TTFont(base_woff2_path)
    base.flavor = None
    base.save(base_path)

    donor = TTFont(donor_path)
    missing = sorted(set(donor.getBestCmap()) - set(base.getBestCmap()))
    subsetter = subset.Subsetter(
        subset.Options(
            layout_features=["*"],
            name_IDs=["*"],
            notdef_outline=True,
            glyph_names=False,
            hinting=True,
            legacy_kern=True,
        )
    )
    subsetter.populate(unicodes=missing)
    subsetter.subset(donor)
    # Without the donor's substitutions, nothing can replace a glyph the base
    # already draws with one from the re-spaced release.
    del donor["GSUB"]
    donor.save(donor_path)

    font = Merger().merge([str(base_path), str(donor_path)])
    for tag in TABLES_KEPT_FROM_BASE:
        font[tag] = TTFont(base_woff2_path)[tag]
    font["head"].created = weight["created"]
    font["head"].modified = weight["modified"]
    font.recalcTimestamp = False
    font.flavor = "woff2"
    out_path = work_dir / weight["file"]
    font.save(out_path)
    return out_path


def tables(path):
    font = TTFont(path)
    return {tag: font.getTableData(tag) for tag in font.reader.keys()}


def main():
    check = sys.argv[1:] == ["--check"]
    if sys.argv[1:] and not check:
        sys.exit(__doc__)

    failed = False
    for weight in WEIGHTS:
        with tempfile.TemporaryDirectory() as work_dir:
            built_path = merged(weight, Path(work_dir))
            committed_path = HERE / weight["file"]
            if not check:
                committed_path.write_bytes(built_path.read_bytes())
                print(f"wrote {weight['file']}")
                continue
            built, committed = tables(built_path), tables(committed_path)
            different = sorted(
                tag
                for tag in built.keys() | committed.keys()
                if built.get(tag) != committed.get(tag)
            )
            if different:
                failed = True
                print(f"{weight['file']}: differs in {', '.join(different)}")
            else:
                print(f"{weight['file']}: matches, {len(built)} tables")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
