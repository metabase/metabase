# nix/shell-functions/validation.nix
#
# Environment validation and help for the dev shell.
#
{ }:

''
  mb-help() {
    echo ""
    echo "Metabase Nix Dev Shell Commands"
    echo "═══════════════════════════════════════"
    echo ""
    echo "  Navigation:"
    echo "    mb-src              cd to src/metabase"
    echo "    mb-frontend         cd to frontend"
    echo "    mb-test             cd to test"
    echo "    mb-drivers          cd to modules/drivers"
    echo "    mb-root             cd to project root"
    echo ""
    echo "  Build:"
    echo "    mb-build            Full build (all steps)"
    echo "    mb-build-frontend   Build frontend only"
    echo "    mb-build-backend    Build uberjar only"
    echo "    mb-build-drivers    Build drivers only"
    echo "    mb-build-i18n       Build i18n artifacts"
    echo "    mb-repl             Start Clojure REPL"
    echo ""
    echo "  Clean:"
    echo "    mb-clean-frontend   Remove node_modules & frontend artifacts"
    echo "    mb-clean-backend    Remove target/"
    echo "    mb-clean-all        Remove all build artifacts"
    echo ""
    echo "  Database:"
    echo "    pg-start            Start local PostgreSQL"
    echo "    pg-stop             Stop local PostgreSQL"
    echo "    pg-reset            Wipe and reinitialize PostgreSQL"
    echo "    pg-create [name]    Create database (default: metabase)"
    echo ""
    echo "  Validation:"
    echo "    mb-check-env        Check tool versions"
    echo "    mb-help             Show this help"
    echo ""
  }

  mb-check-env() {
    echo "Metabase Nix Environment Check"
    echo "══════════════════════════════════"
    echo ""

    local ok=true

    check_tool() {
      local name="$1"
      local version_output="$2"
      if [ -n "$version_output" ]; then
        printf "  %-12s %s\n" "$name:" "$version_output"
      else
        printf "  %-12s MISSING\n" "$name:"
        ok=false
      fi
    }

    check_tool "Java"       "$(java -version 2>&1 | head -1)"
    check_tool "Clojure"    "$(clojure --version 2>&1)"
    check_tool "Node"       "$(node --version 2>&1)"
    check_tool "Bun"        "$(bun --version 2>&1)"
    check_tool "Python"     "$(python3 --version 2>&1)"
    check_tool "PostgreSQL" "$(postgres --version 2>&1)"
    check_tool "Git"        "$(git --version 2>&1)"
    echo ""

    if $ok; then
      echo "  All tools available."
    else
      echo "  WARNING: Some tools are missing!"
    fi
    echo ""
  }
''
