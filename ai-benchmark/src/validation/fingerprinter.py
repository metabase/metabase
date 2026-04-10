"""Hash-based fingerprinting for SQL result set comparison."""

import hashlib
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from itertools import product
from typing import Any


@dataclass(frozen=True)
class ResultSetFingerprint:
    """Fingerprint of a SQL result set for equality comparison.

    Guarantees:
    - If fingerprints differ: result sets are DEFINITELY different
    - If fingerprints match: result sets are equal with overwhelming probability
    """

    row_count: int
    distinct_row_count: int
    column_count: int | None
    content_hash: str

    def __eq__(self, other: "ResultSetFingerprint") -> bool:
        if not isinstance(other, ResultSetFingerprint):
            return NotImplemented
        return (
            self.row_count == other.row_count
            and self.distinct_row_count == other.distinct_row_count
            and self.column_count == other.column_count
            and self.content_hash == other.content_hash
        )


class MultisetRowHashComparator:
    """Compares SQL result sets for equality using multiset fingerprinting."""

    def __init__(
        self,
        float_precision: int | None = 6,
        coerce_types: bool = True,
        null_sentinel: str = "\x00NULL\x00",
    ):
        self.float_precision = float_precision
        self.coerce_types = coerce_types
        self.null_sentinel = null_sentinel

    def normalize_value(self, value: Any) -> tuple[str, str]:
        """Normalize a single value to (type_tag, canonical_string)."""
        if value is None:
            return ("null", self.null_sentinel)

        if isinstance(value, bool):
            return ("bool", str(value))

        if isinstance(value, int):
            if self.coerce_types:
                return ("numeric", str(value))
            return ("int", str(value))

        if isinstance(value, float):
            if self.float_precision is not None:
                value = round(value, self.float_precision)
            if self.coerce_types:
                try:
                    if value == int(value):
                        return ("numeric", str(int(value)))
                except (ValueError, OverflowError):
                    pass
                return ("numeric", str(value))
            return ("float", repr(value))

        if isinstance(value, Decimal):
            if self.float_precision is not None:
                value = round(value, self.float_precision)
            if self.coerce_types:
                try:
                    if value == int(value):
                        return ("numeric", str(int(value)))
                except (ValueError, OverflowError):
                    pass
                return ("numeric", str(value))
            return ("decimal", str(value))

        if isinstance(value, str):
            if self.coerce_types:
                return ("string", value)
            return ("str", value)

        if isinstance(value, bytes):
            return ("bytes", value.hex())

        if isinstance(value, (list | tuple)):
            normalized_elements = [self.normalize_value(v) for v in value]
            return ("array", repr(normalized_elements))

        return (type(value).__name__, repr(value))

    def normalize_row(self, row: Sequence[Any]) -> str:
        """Convert a row to a canonical string representation."""
        normalized = [self.normalize_value(v) for v in row]
        return repr(normalized)

    def row_hash(self, row: Sequence[Any]) -> str:
        """Hash a single row to a hex string."""
        canonical = self.normalize_row(row)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def fingerprint(self, rows: Sequence[Sequence[Any]]) -> ResultSetFingerprint:
        """Compute a fingerprint for an entire result set."""
        if not rows:
            return ResultSetFingerprint(
                row_count=0, distinct_row_count=0, column_count=None, content_hash=hashlib.sha256(b"empty").hexdigest()
            )

        row_hashes = [self.row_hash(row) for row in rows]
        hash_counts = Counter(row_hashes)

        col_counts = set(len(row) for row in rows)
        column_count = col_counts.pop() if len(col_counts) == 1 else None

        canonical_histogram = sorted(hash_counts.items())
        histogram_str = repr(canonical_histogram)
        content_hash = hashlib.sha256(histogram_str.encode("utf-8")).hexdigest()

        return ResultSetFingerprint(
            row_count=len(rows),
            distinct_row_count=len(hash_counts),
            column_count=column_count,
            content_hash=content_hash,
        )

    def compare(self, rows_a: Sequence[Sequence[Any]], rows_b: Sequence[Sequence[Any]]) -> bool:
        """Compare two result sets for equality."""
        return self.fingerprint(rows_a) == self.fingerprint(rows_b)

    def diff(self, rows_a: Sequence[Sequence[Any]], rows_b: Sequence[Sequence[Any]]) -> dict:
        """Compute a detailed diff between two result sets."""
        hashes_a = Counter(self.row_hash(row) for row in rows_a)
        hashes_b = Counter(self.row_hash(row) for row in rows_b)

        only_in_a = hashes_a - hashes_b
        only_in_b = hashes_b - hashes_a

        hash_to_row_a = {self.row_hash(row): row for row in rows_a}
        hash_to_row_b = {self.row_hash(row): row for row in rows_b}

        return {
            "equal": not only_in_a and not only_in_b,
            "rows_only_in_a": [{"row": hash_to_row_a.get(h), "count": c} for h, c in only_in_a.items()],
            "rows_only_in_b": [{"row": hash_to_row_b.get(h), "count": c} for h, c in only_in_b.items()],
            "row_count_a": len(rows_a),
            "row_count_b": len(rows_b),
        }


class ColumnSubsetMatchComparator(MultisetRowHashComparator):
    """Extends MultisetRowHashComparator to detect column subset matches."""

    def column_fingerprint(self, rows: Sequence[Sequence[Any]], col_idx: int) -> str:
        """Fingerprint a single column as a multiset of values."""
        if not rows:
            return hashlib.sha256(b"empty_column").hexdigest()

        value_hashes = []
        for row in rows:
            normalized = self.normalize_value(row[col_idx])
            h = hashlib.sha256(repr(normalized).encode()).hexdigest()
            value_hashes.append(h)

        counts = Counter(value_hashes)
        canonical = sorted(counts.items())
        return hashlib.sha256(repr(canonical).encode()).hexdigest()

    def all_column_fingerprints(self, rows: Sequence[Sequence[Any]]) -> list[str]:
        """Compute fingerprint for each column."""
        if not rows:
            return []
        n_cols = len(rows[0])
        return [self.column_fingerprint(rows, i) for i in range(n_cols)]

    def find_column_subset_match(
        self, rows_a: Sequence[Sequence[Any]], rows_b: Sequence[Sequence[Any]], max_candidates: int = 1000
    ) -> dict:
        """Check if some column subset of one row set equals the other."""
        if not rows_a or not rows_b:
            return {
                "match": len(rows_a) == len(rows_b) == 0,
                "column_mapping": () if not rows_b else None,
                "candidate_count": 0,
                "terminated_early": False,
                "swapped": False,
            }

        if len(rows_a) != len(rows_b):
            return {
                "match": False,
                "column_mapping": None,
                "candidate_count": 0,
                "terminated_early": False,
                "reason": "row_count_mismatch",
                "swapped": False,
            }

        swapped = False
        if len(rows_b[0]) > len(rows_a[0]):
            rows_a, rows_b = rows_b, rows_a
            swapped = True

        fp_a = self.all_column_fingerprints(rows_a)
        fp_b = self.all_column_fingerprints(rows_b)

        candidates_per_b_col: list[list[int]] = []
        for b_idx, b_fp in enumerate(fp_b):
            matching_a_cols = [a_idx for a_idx, a_fp in enumerate(fp_a) if a_fp == b_fp]
            if not matching_a_cols:
                return {
                    "match": False,
                    "column_mapping": None,
                    "candidate_count": 0,
                    "terminated_early": False,
                    "reason": f"no_matching_column_for_b[{b_idx}]",
                    "swapped": swapped,
                }
            candidates_per_b_col.append(matching_a_cols)

        total_candidates = 1
        for c in candidates_per_b_col:
            total_candidates *= len(c)

        checked = 0
        terminated_early = False

        for mapping in product(*candidates_per_b_col):
            if len(set(mapping)) != len(mapping):
                continue

            checked += 1
            if checked > max_candidates:
                terminated_early = True
                break

            projected_a = [tuple(row[col_idx] for col_idx in mapping) for row in rows_a]
            rows_b_tuples = [tuple(row) for row in rows_b]

            if self.compare(projected_a, rows_b_tuples):
                return {
                    "match": True,
                    "column_mapping": mapping,
                    "candidate_count": checked,
                    "terminated_early": False,
                    "swapped": swapped,
                }

        return {
            "match": False,
            "column_mapping": None,
            "candidate_count": checked,
            "terminated_early": terminated_early,
            "swapped": swapped,
        }
