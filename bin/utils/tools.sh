# bin/utils/tools.sh - Tool detection and version checking utilities
# Source this file to get tool-related helper functions.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/utils/tools.sh"
#   if has_tool java; then
#     version=$(get_java_version)
#   fi
#
# Provides: has_tool, get_*_version, check_*_requirements

# Guard against multiple inclusion
[[ -n "${_DEVUTILS_TOOLS_LOADED:-}" ]] && return 0
_DEVUTILS_TOOLS_LOADED=1

# =============================================================================
# Generic Tool Detection
# =============================================================================

# Check if a command/tool is available
# Usage: has_tool java
# Returns: 0 if found, 1 if not found
has_tool() {
    command -v "$1" &> /dev/null
}

# =============================================================================
# Node.js
# =============================================================================

get_node_version() {
    if has_tool node; then
        node --version
    else
        echo ""
    fi
}

# =============================================================================
# Bun
# =============================================================================

get_bun_version() {
    if has_tool bun; then
        bun --version
    else
        echo ""
    fi
}

# =============================================================================
# Java
# =============================================================================

get_java_version() {
    if has_tool java; then
        java -version 2>&1 | head -n 1 | awk -F '"' '{print $2}'
    else
        echo ""
    fi
}

get_java_distribution() {
    if has_tool java; then
        local full_version=$(java -version 2>&1)

        # Check for various distributions
        if echo "$full_version" | grep -qi "Temurin"; then
            echo "Eclipse Temurin"
        elif echo "$full_version" | grep -qi "Adoptium"; then
            echo "Eclipse Adoptium"
        elif echo "$full_version" | grep -qi "Oracle"; then
            echo "Oracle"
        elif echo "$full_version" | grep -qi "OpenJDK"; then
            echo "OpenJDK"
        elif echo "$full_version" | grep -qi "Amazon Corretto"; then
            echo "Amazon Corretto"
        elif echo "$full_version" | grep -qi "Azul Zulu"; then
            echo "Azul Zulu"
        elif echo "$full_version" | grep -qi "GraalVM"; then
            echo "GraalVM"
        else
            echo "Unknown"
        fi
    else
        echo ""
    fi
}

check_java_requirements() {
    local version=$1
    local distribution=$2
    local major_version=""

    if [ -n "$version" ]; then
        # Extract major version (handles both "21.0.1" and "1.8.0" formats)
        if [[ $version =~ ^1\. ]]; then
            major_version=$(echo "$version" | cut -d. -f2)
        else
            major_version=$(echo "$version" | cut -d. -f1)
        fi

        # Check version and distribution
        if [ "$major_version" = "21" ] && [[ "$distribution" =~ "Temurin" ]]; then
            echo "correct"
        elif [ "$major_version" = "21" ]; then
            echo "wrong_distribution"
        else
            echo "wrong_version"
        fi
    else
        echo "not_installed"
    fi
}

# =============================================================================
# Clojure
# =============================================================================

get_clojure_version() {
    if has_tool clojure; then
        clojure --version 2>&1 | head -n 1
    else
        echo ""
    fi
}

get_required_clojure_version() {
    if [ -f "deps.edn" ]; then
        # Extract org.clojure/clojure version from deps.edn
        grep "org.clojure/clojure" deps.edn | grep ":mvn/version" | sed -E 's/.*"([0-9.]+)".*/\1/' | head -n 1
    else
        echo ""
    fi
}

# =============================================================================
# Babashka
# =============================================================================

get_babashka_version() {
    if has_tool bb; then
        bb --version
    else
        echo ""
    fi
}

# =============================================================================
# Version Managers
# =============================================================================

detect_version_managers() {
    local managers=()

    # nvm - Node Version Manager
    if [ -d "$HOME/.nvm" ] || [ -n "${NVM_DIR:-}" ] || has_tool nvm; then
        managers+=("nvm")
    fi

    # fnm - Fast Node Manager
    if has_tool fnm || [ -d "$HOME/.fnm" ]; then
        managers+=("fnm")
    fi

    # n - Node version management (no subcommands)
    if has_tool n || [ -d "/usr/local/n" ]; then
        managers+=("n")
    fi

    # volta - JavaScript Tool Manager
    if has_tool volta || [ -d "$HOME/.volta" ]; then
        managers+=("volta")
    fi

    # asdf - Extendable version manager (multi-language)
    if [ -d "$HOME/.asdf" ] || has_tool asdf; then
        managers+=("asdf")
    fi

    # mise - Dev tools version manager
    if has_tool mise || [ -d "$HOME/.local/share/mise" ] || [ -d "$HOME/.mise" ]; then
        managers+=("mise")
    fi

    # jenv - Java version manager
    if [ -d "$HOME/.jenv" ] || has_tool jenv; then
        managers+=("jenv")
    fi

    # SDKMAN! - Software Development Kit Manager (Java, Gradle, Maven, etc.)
    if [ -d "$HOME/.sdkman" ] || [ -n "${SDKMAN_DIR:-}" ]; then
        managers+=("sdkman")
    fi

    echo "${managers[@]}"
}
