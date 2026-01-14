# bin/utils/files.sh - File utilities
# Source this file to get file-related helper functions.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/utils/files.sh"
#   age=$(get_file_age "/path/to/file")
#   echo "File was modified $age"
#
# Provides: get_file_age

# Guard against multiple inclusion
[[ -n "${_DEVUTILS_FILES_LOADED:-}" ]] && return 0
_DEVUTILS_FILES_LOADED=1

# No dependencies - this module is standalone

# Get a human-readable age string for a file
# Usage: get_file_age "/path/to/file"
# Returns: "Xs ago", "Xm ago", "Xh ago", "Xd ago", or "not found"
get_file_age() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo "not found"
        return
    fi

    local now=$(date +%s)
    # macOS uses -f, Linux uses -c
    local file_time=$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null)
    local age_seconds=$((now - file_time))

    if [ $age_seconds -lt 60 ]; then
        echo "${age_seconds}s ago"
    elif [ $age_seconds -lt 3600 ]; then
        echo "$((age_seconds / 60))m ago"
    elif [ $age_seconds -lt 86400 ]; then
        echo "$((age_seconds / 3600))h ago"
    else
        echo "$((age_seconds / 86400))d ago"
    fi
}
