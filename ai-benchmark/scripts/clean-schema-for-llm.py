#!/usr/bin/env python3
"""
Clean PostgreSQL schema dump for LLM consumption.

This script processes the output from export-dump-schema-only.sh and removes everything except:
- CREATE TABLE statements
- ALTER TABLE statements

All other comments, blank lines (including within statements), and SQL statements are removed.

Options:
    --remove-enriched    Remove statements referencing schemas ending in '_enriched'

Usage:
    ./clean-schema-for-llm.py < input.sql > output.sql
    ./export-dump-schema-only.sh | ./clean-schema-for-llm.py > clean-schema.sql
    ./export-dump-schema-only.sh analytics | ./clean-schema-for-llm.py > analytics-clean.sql
    ./export-dump-schema-only.sh | ./clean-schema-for-llm.py --remove-enriched > clean-schema.sql
"""

import argparse
import re
import sys


def clean_schema(input_text: str, remove_enriched: bool = False) -> str:
    """
    Clean SQL schema dump to keep only CREATE TABLE and ALTER TABLE statements.

    Args:
        input_text: Raw SQL schema dump
        remove_enriched: If True, skip statements referencing schemas ending in '_enriched'

    Returns:
        Cleaned SQL with only relevant statements
    """
    lines = input_text.split("\n")
    output_lines = []

    # Track if we're inside a statement we want to keep
    in_create_table = False
    in_alter_table = False
    current_statement = []

    for line in lines:
        stripped = line.strip()

        # Skip all comments
        if stripped.startswith("--"):
            continue

        # Skip blank lines (both between and within statements)
        if not stripped:
            continue

        # Detect start of CREATE TABLE statement
        if re.match(r"^CREATE TABLE\s+", stripped, re.IGNORECASE):
            in_create_table = True
            current_statement = [line]

            # Check if this references an _enriched schema
            if remove_enriched:
                match = re.search(r"CREATE TABLE\s+(\w+)\.", stripped, re.IGNORECASE)
                if match and match.group(1).endswith("_enriched"):
                    in_create_table = False
                    current_statement = []
            continue

        # Detect start of ALTER TABLE statement
        if re.match(r"^ALTER TABLE\s+", stripped, re.IGNORECASE):
            in_alter_table = True
            current_statement = [line]

            # Check if this references an _enriched schema
            if remove_enriched:
                match = re.search(r"ALTER TABLE\s+(\w+)\.", stripped, re.IGNORECASE)
                if match and match.group(1).endswith("_enriched"):
                    in_alter_table = False
                    current_statement = []
            continue

        # If we're in a CREATE TABLE or ALTER TABLE statement
        if in_create_table or in_alter_table:
            current_statement.append(line)

            # Check if statement ends (semicolon at end of line)
            if stripped.endswith(";"):
                # Add the complete statement to output
                output_lines.extend(current_statement)
                output_lines.append("")  # Add blank line after statement

                # Reset state
                in_create_table = False
                in_alter_table = False
                current_statement = []

    # Join lines and clean up excessive blank lines
    result = "\n".join(output_lines)

    # Replace multiple consecutive blank lines with a single blank line
    result = re.sub(r"\n\n\n+", "\n\n", result)

    # Ensure file ends with a single newline
    result = result.rstrip() + "\n"

    return result


def main():
    """Main entry point for the script."""
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="Clean PostgreSQL schema dump for LLM consumption.")
    parser.add_argument(
        "--remove-enriched", action="store_true", help="Remove statements referencing schemas ending in _enriched"
    )
    args = parser.parse_args()

    # Read from stdin
    input_text = sys.stdin.read()

    # Clean the schema
    cleaned = clean_schema(input_text, remove_enriched=args.remove_enriched)

    # Write to stdout
    sys.stdout.write(cleaned)


if __name__ == "__main__":
    main()
