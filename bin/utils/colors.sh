# bin/utils/colors.sh - TTY-aware color definitions
# Source this file to get color variables for terminal output.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/utils/colors.sh"
#   echo -e "${GREEN}Success${NC}"
#
# Provides: RED, GREEN, YELLOW, BLUE, CYAN, BOLD, DIM, NC
# All variables are empty strings when output is not a terminal.

# Guard against multiple inclusion
[[ -n "${_DEVUTILS_COLORS_LOADED:-}" ]] && return 0
_DEVUTILS_COLORS_LOADED=1

if [ -t 1 ] && [ -n "${TERM:-}" ] && [ "${TERM}" != "dumb" ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  DIM='\033[2m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  CYAN=''
  BOLD=''
  DIM=''
  NC=''
fi
