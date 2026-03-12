# bin/utils/logging.sh - Logging and output functions
# Source this file to get standardized print functions for terminal output.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/utils/logging.sh"
#   print_header "My Script"
#   print_step "Doing something"
#   print_success "It worked"
#
# Provides: print_header, print_step, print_success, print_error, print_warning, print_info

# Guard against multiple inclusion
[[ -n "${_DEVUTILS_LOGGING_LOADED:-}" ]] && return 0
_DEVUTILS_LOGGING_LOADED=1

# Source dependencies
_DEVUTILS_LOGGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_DEVUTILS_LOGGING_DIR/colors.sh"
unset _DEVUTILS_LOGGING_DIR

# Print a prominent header (for script titles, major sections)
print_header() {
    echo -e "\n${BOLD}${BLUE}===================================================================${NC}"
    echo -e "${BOLD}${BLUE}  $1${NC}"
    echo -e "${BOLD}${BLUE}===================================================================${NC}\n"
}

# Print a section header (for grouping related output)
print_section() {
    echo -e "\n${BOLD}$1${NC}"
    echo -e "${BOLD}$(printf -- '-%.0s' {1..67})${NC}"
}

# Print a step indicator (for progress through tasks)
print_step() {
    echo -e "\n${BOLD}${BLUE}→${NC} ${BOLD}$1${NC}"
}

# Print a success message
print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

# Print an error message
print_error() {
    echo -e "  ${RED}✗${NC} $1"
}

# Print a warning message
print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

# Print an info message
print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# Print a dimmed message (for hints, secondary info)
print_dim() {
    echo -e "  ${DIM}$1${NC}"
}
