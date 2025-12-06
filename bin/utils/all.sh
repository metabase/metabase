# bin/utils/all.sh - Load all utility modules
# Source this file to get all utilities in one go.
#
# Usage:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SCRIPT_DIR/utils/all.sh"
#
# This sources all utility modules in the correct order to satisfy dependencies.

# Guard against multiple inclusion
[[ -n "${_DEVUTILS_ALL_LOADED:-}" ]] && return 0
_DEVUTILS_ALL_LOADED=1

_DEVUTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Order matters: colors first (no deps), then modules that depend on it
source "$_DEVUTILS_DIR/colors.sh"
source "$_DEVUTILS_DIR/logging.sh"
source "$_DEVUTILS_DIR/prompts.sh"
source "$_DEVUTILS_DIR/files.sh"
source "$_DEVUTILS_DIR/tools.sh"

unset _DEVUTILS_DIR
