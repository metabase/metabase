# bin/utils/prompts.sh - Interactive prompt utilities
# Source this file to get functions for user interaction.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/utils/prompts.sh"
#   if ask_yes_no "Continue?" "y"; then
#       echo "User said yes"
#   fi
#
# Provides: ask_yes_no

# Guard against multiple inclusion
[[ -n "${_DEVUTILS_PROMPTS_LOADED:-}" ]] && return 0
_DEVUTILS_PROMPTS_LOADED=1

# No dependencies - this module is standalone

# Ask a yes/no question with a default answer
# Usage: ask_yes_no "Question?" [default]
#   default: "y" for yes (default), "n" for no
# Returns: 0 for yes, 1 for no
ask_yes_no() {
    local prompt=$1
    local default=${2:-y}
    local yn

    if [ "$default" = "y" ]; then
        prompt="$prompt [Y/n] "
    else
        prompt="$prompt [y/N] "
    fi

    read -r -p "$prompt" yn
    yn=${yn:-$default}

    case "$yn" in
        [Yy]*) return 0 ;;
        *) return 1 ;;
    esac
}
