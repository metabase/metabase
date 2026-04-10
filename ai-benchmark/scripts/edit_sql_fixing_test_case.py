#!/usr/bin/env python3
"""
Script to edit SQL fixing test cases interactively.

This script finds a test case by description substring, extracts it to temporary files
for editing, and then merges the changes back to the original JSON file.

Usage:
    python edit_sql_fixing_test_case.py --description "substring to search" input1.json input2.json ...
"""

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any


def search_test_cases(input_files: list[Path], description_substring: str) -> list[tuple[Path, int, dict[str, Any]]]:
    """
    Search for test cases matching the description substring in the provided files.

    Returns:
        List of tuples (file_path, index, test_case)
    """
    matches = []

    for json_file in input_files:
        if not json_file.exists():
            print(f"Warning: File not found: {json_file}", file=sys.stderr)
            continue

        try:
            with open(json_file) as f:
                test_cases = json.load(f)

            if not isinstance(test_cases, list):
                print(f"Warning: Expected JSON array in {json_file}", file=sys.stderr)
                continue

            for idx, test_case in enumerate(test_cases):
                description = test_case.get("description", "")
                if description_substring.lower() in description.lower():
                    matches.append((json_file, idx, test_case))

        except (OSError, json.JSONDecodeError) as e:
            print(f"Warning: Could not read {json_file}: {e}", file=sys.stderr)
            continue

    return matches


def extract_test_case(test_case: dict[str, Any], temp_dir: Path) -> list[str]:
    """
    Extract test case to temporary files.

    Writes fixed.sql, broken.sql, error_message.txt, and test_case.json (without query/error fields).
    Returns the list of original keys to preserve order.
    """
    # Write SQL files
    fixed_sql_path = temp_dir / "fixed.sql"
    broken_sql_path = temp_dir / "broken.sql"
    error_message_path = temp_dir / "error_message.txt"
    test_case_json_path = temp_dir / "test_case.json"

    fixed_sql_path.write_text(test_case.get("fixed_query", ""))
    broken_sql_path.write_text(test_case.get("broken_query", ""))
    error_message_path.write_text(test_case.get("error_message", ""))

    # Create test case dict without query and error_message fields
    test_case_without_extracted_fields = {
        k: v for k, v in test_case.items() if k not in ("fixed_query", "broken_query", "error_message")
    }

    with open(test_case_json_path, "w") as f:
        json.dump(test_case_without_extracted_fields, f, indent=2)
        f.write("\n")

    print("\nExtracted files to:")
    print(f"  {temp_dir}/")
    print(f"  {temp_dir / 'fixed.sql'}")
    print(f"  {temp_dir / 'broken.sql'}")
    print(f"  {temp_dir / 'error_message.txt'}")
    print(f"  {temp_dir / 'test_case.json'}")

    # Return original keys list to preserve order
    return list(test_case.keys())


def read_modified_test_case(temp_dir: Path, original_keys: list[str]) -> dict[str, Any]:
    """
    Read modified test case from temporary directory.

    Merges fixed.sql, broken.sql, error_message.txt, and test_case.json back together,
    preserving the original key order.
    """
    fixed_sql_path = temp_dir / "fixed.sql"
    broken_sql_path = temp_dir / "broken.sql"
    error_message_path = temp_dir / "error_message.txt"
    test_case_json_path = temp_dir / "test_case.json"

    # Read SQL files and error message
    fixed_query = fixed_sql_path.read_text().strip()
    broken_query = broken_sql_path.read_text().strip()
    error_message = error_message_path.read_text().strip()

    with open(test_case_json_path) as f:
        modified_fields = json.load(f)

    modified_fields["fixed_query"] = fixed_query
    modified_fields["broken_query"] = broken_query
    modified_fields["error_message"] = error_message

    # Preserve original_keys order
    return {k: modified_fields[k] for k in original_keys}


def update_test_case_in_file(file_path: Path, index: int, updated_test_case: dict[str, Any]) -> None:
    """
    Update a single test case in the original JSON file.

    Replaces the test case at the given index with the updated version.
    """
    with open(file_path) as f:
        test_cases = json.load(f)

    if not isinstance(test_cases, list):
        raise ValueError(f"Expected JSON array in {file_path}")

    if index < 0 or index >= len(test_cases):
        raise IndexError(f"Index {index} out of range for {file_path}")

    test_cases[index] = updated_test_case

    with open(file_path, "w") as f:
        json.dump(test_cases, f, indent=2)
        f.write("\n")


def prompt_user_to_continue(view_only) -> None:
    """Wait for user to press any key to continue."""
    editing_or_viewing = "viewing" if view_only else "editing"
    print(f"\nPress Enter to continue after {editing_or_viewing} the files...")
    input()


def prompt_user_to_validate() -> bool:
    """Ask user if they want to run validation script."""
    print("\nWould you like to run validate_sql_fixing_test_cases.py to update the error_message?")
    response = input("(y/n): ").strip().lower()
    return response in ("y", "yes")


def run_validation_script(temp_dir: Path) -> dict[str, Any]:
    """
    Run the validation script on the updated test case.

    Returns the validated test case with updated error_message.
    """
    import subprocess

    script_path = Path(__file__).parent / "validate_sql_fixing_test_cases.py"
    updated_test_case_path = temp_dir / "updated_test_case.json"

    cmd = [
        "poetry",
        "run",
        "python3",
        str(script_path),
        "--overwrite-input",
        str(updated_test_case_path),
    ]

    print(f"\nRunning: {' '.join(cmd)}")
    print("=" * 80)

    try:
        result = subprocess.run(cmd, check=False)

        if result.returncode != 0:
            print("\nWarning: Validation script returned non-zero exit code", file=sys.stderr)

        # Read back the validated test case
        with open(updated_test_case_path) as f:
            validated_test_cases = json.load(f)

        if not isinstance(validated_test_cases, list) or len(validated_test_cases) != 1:
            raise ValueError("Expected single test case in validated file")

        return validated_test_cases[0]

    except Exception as e:
        print(f"\nError running validation script: {e}", file=sys.stderr)
        print("Continuing without validation...", file=sys.stderr)
        # Return None to indicate validation failed
        return None


def main():
    parser = argparse.ArgumentParser(description="Edit SQL fixing test case interactively")

    parser.add_argument(
        "--description",
        required=True,
        help="Substring to search for in test case descriptions",
    )
    parser.add_argument(
        "input_files",
        nargs="+",
        help="Path(s) to JSON file(s) containing test cases to search",
    )
    parser.add_argument(
        "--view-only",
        action="store_true",
        help="Only extract and view files, do not update the original test case",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Automatically run validation script without prompting",
    )
    parser.add_argument(
        "--cleanup",
        type=lambda x: x.lower() != "false",
        default=True,
        help="Clean up temporary directory when done (default: true)",
    )

    args = parser.parse_args()

    # Convert input files to Path objects
    input_files = [Path(f) for f in args.input_files]

    # Search for matching test cases
    print(f"Searching for test cases matching: '{args.description}'")
    matches = search_test_cases(input_files, args.description)

    if len(matches) == 0:
        print(f"Error: No test cases found matching '{args.description}'", file=sys.stderr)
        sys.exit(1)

    if len(matches) > 1:
        print(f"Error: Found {len(matches)} test cases matching '{args.description}':", file=sys.stderr)
        for file_path, _index, test_case in matches:
            print(f"  - {test_case.get('description', 'Unknown')} in {file_path}", file=sys.stderr)
        print("\nPlease provide a more specific description substring.", file=sys.stderr)
        sys.exit(1)

    # Extract the single matching test case
    file_path, index, test_case = matches[0]
    print(f"Found test case: {test_case.get('description', 'Unknown')}")
    print(f"Location: {file_path} (index {index})")

    # Create temporary directory
    temp_dir = Path(tempfile.mkdtemp(prefix="edit_sql_fixing_test_case_"))

    try:
        original_keys = extract_test_case(test_case, temp_dir)
        prompt_user_to_continue(args.view_only)

        if args.view_only:
            print("\nView-only mode: skipping updates")
            return

        print("\nReading modified files...")
        updated_test_case = read_modified_test_case(temp_dir, original_keys)

        validated_test_case = None
        if args.validate or prompt_user_to_validate():
            # Write single test case to temporary file for validation
            updated_test_case_path = temp_dir / "updated_test_case.json"
            with open(updated_test_case_path, "w") as f:
                json.dump([updated_test_case], f, indent=2)
                f.write("\n")

            print(f"Wrote test case to: {updated_test_case_path}")

            # Run validation and get back the validated test case
            validated_test_case = run_validation_script(temp_dir)

        # Use validated test case if available, otherwise use the updated one
        final_test_case = validated_test_case if validated_test_case is not None else updated_test_case

        # Update the original file
        print(f"\nUpdating {file_path}...")
        update_test_case_in_file(file_path, index, final_test_case)
        print("Test case updated successfully!")

    finally:
        if args.cleanup:
            print(f"\nCleaning up temporary directory: {temp_dir}")
            shutil.rmtree(temp_dir, ignore_errors=True)
        else:
            print(f"\nTemporary directory preserved at: {temp_dir}")

    print("\nDone!")


if __name__ == "__main__":
    main()
