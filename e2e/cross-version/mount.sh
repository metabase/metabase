#!/usr/bin/env bash
# run-e2e-parallel.sh

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

BRANCHES=(
  "master"
  "release-x.57.x"
  "release-x.58.x"
  "release-x.59.x"
)

E2E_DIR="e2e"
WORKTREE_BASE="/tmp/worktrees"
LOG_DIR="/tmp/e2e-logs"
TEST_CMD="npm run test:e2e"

# ── Colours ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()     { echo -e "${BLUE}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; }
dim()     { echo -e "${CYAN}[link]${NC}  $*"; }

branch_to_slug() {
  echo "$1" | sed 's|/|-|g'
}

# resolve the root of the repo we were invoked from
REPO_ROOT="$(git rev-parse --show-toplevel)"

# ── Preflight ─────────────────────────────────────────────────────────────────

preflight() {
  log "Running preflight checks..."

  if ! git rev-parse --git-dir &>/dev/null; then
    error "Not inside a git repository."
    exit 1
  fi

  for branch in "${BRANCHES[@]}"; do
    if ! git show-ref --verify --quiet "refs/heads/$branch" && \
       ! git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
      error "Branch '$branch' not found locally or in origin."
      exit 1
    fi
  done

  local cmd
  cmd=$(echo "$TEST_CMD" | awk '{print $1}')
  if ! command -v "$cmd" &>/dev/null; then
    warn "Command '$cmd' not found on PATH — tests may fail."
  fi

  mkdir -p "$WORKTREE_BASE" "$LOG_DIR"
  success "Preflight passed."
}

# ── Worktree setup ────────────────────────────────────────────────────────────

setup_worktree() {
  local branch="$1"
  local slug
  slug=$(branch_to_slug "$branch")

  if [[ "$branch" == "master" ]]; then
    log "master: using current working directory ($REPO_ROOT)"
    return
  fi

  local path="$WORKTREE_BASE/$slug"

  if [[ -d "$path" ]]; then
    warn "$branch: stale worktree found at $path — removing..."
    git worktree remove --force "$path" 2>/dev/null || rm -rf "$path"
    git worktree prune
  fi

  log "$branch: creating worktree at $path..."

  if ! git show-ref --verify --quiet "refs/heads/$branch"; then
    git worktree add --track -b "$branch" "$path" "origin/$branch"
  else
    git worktree add "$path" "$branch"
  fi

  (
    cd "$path"
    git sparse-checkout init --cone
    git sparse-checkout set "$E2E_DIR"
  )

  success "$branch: worktree ready → $path (sparse: /$E2E_DIR)"
}

setup_all_worktrees() {
  log "Setting up worktrees..."
  for branch in "${BRANCHES[@]}"; do
    setup_worktree "$branch"
  done
}

# ── Symlinks ──────────────────────────────────────────────────────────────────

# Each non-master branch gets a named symlink inside the master e2e directory:
#   <repo>/e2e/release-x.58.x  ->  /tmp/worktrees/release-x.58.x/e2e
#
# .git/info/exclude is used so .gitignore is never modified.

SYMLINK_NAMES=()   # track what we created so cleanup is precise

mount_symlinks() {
  log "Mounting symlinks into master's $E2E_DIR/ directory..."

  local master_e2e="$REPO_ROOT/$E2E_DIR"

  if [[ ! -d "$master_e2e" ]]; then
    error "Master e2e directory not found: $master_e2e"
    exit 1
  fi

  local exclude_file="$REPO_ROOT/.git/info/exclude"

  for branch in "${BRANCHES[@]}"; do
    [[ "$branch" == "master" ]] && continue

    local slug
    slug=$(branch_to_slug "$branch")

    local target="$WORKTREE_BASE/$slug/$E2E_DIR"
    local link="$master_e2e/$slug"

    # remove stale link if it points somewhere wrong
    if [[ -L "$link" && "$(readlink "$link")" != "$target" ]]; then
      warn "Replacing stale symlink: $link"
      rm "$link"
    fi

    if [[ -e "$link" && ! -L "$link" ]]; then
      error "$link exists and is not a symlink — aborting to avoid data loss."
      exit 1
    fi

    ln -sfn "$target" "$link"
    SYMLINK_NAMES+=("$slug")
    dim "$link  →  $target"

    # add to .git/info/exclude (idempotent — only write if not already there)
    local exclude_pattern="$E2E_DIR/$slug"
    if ! grep -qxF "$exclude_pattern" "$exclude_file" 2>/dev/null; then
      echo "$exclude_pattern" >> "$exclude_file"
      log "Excluded '$exclude_pattern' via .git/info/exclude"
    fi
  done

  success "Symlinks mounted."
}

unmount_symlinks() {
  if [[ "${#SYMLINK_NAMES[@]}" -eq 0 ]]; then
    return
  fi

  log "Removing symlinks from master's $E2E_DIR/ directory..."

  local master_e2e="$REPO_ROOT/$E2E_DIR"

  for slug in "${SYMLINK_NAMES[@]}"; do
    local link="$master_e2e/$slug"
    if [[ -L "$link" ]]; then
      rm "$link"
      dim "removed $link"
    fi
  done

  success "Symlinks removed."
}

print_symlink_tree() {
  local master_e2e="$REPO_ROOT/$E2E_DIR"
  echo ""
  echo "  $E2E_DIR/"
  # list real entries first, then symlinks
  while IFS= read -r entry; do
    local name
    name=$(basename "$entry")
    if [[ -L "$entry" ]]; then
      echo -e "  ├── ${CYAN}$name${NC}  →  $(readlink "$entry")"
    else
      echo "  ├── $name"
    fi
  done < <(find "$master_e2e" -maxdepth 1 ! -path "$master_e2e" | sort)
  echo ""
}

# ── Test runner ───────────────────────────────────────────────────────────────

run_tests_for_branch() {
  local branch="$1"
  local slug
  slug=$(branch_to_slug "$branch")
  local log_file="$LOG_DIR/$slug.log"

  local work_dir
  if [[ "$branch" == "master" ]]; then
    work_dir="$REPO_ROOT"
  else
    work_dir="$WORKTREE_BASE/$slug"
  fi

  log "$branch: starting tests (log → $log_file)"

  (
    cd "$work_dir/$E2E_DIR"
    {
      echo "=== branch:  $branch ==="
      echo "=== started: $(date) ==="
      echo "=== dir:     $work_dir/$E2E_DIR ==="
      echo ""
    } > "$log_file"

    if eval "$TEST_CMD" >> "$log_file" 2>&1; then
      echo "" >> "$log_file"
      echo "=== PASSED: $(date) ===" >> "$log_file"
      exit 0
    else
      echo "" >> "$log_file"
      echo "=== FAILED: $(date) ===" >> "$log_file"
      exit 1
    fi
  )
}

run_all_tests() {
  log "Launching tests in parallel..."

  local pids=()
  local branches_running=()

  for branch in "${BRANCHES[@]}"; do
    run_tests_for_branch "$branch" &
    pids+=($!)
    branches_running+=("$branch")
  done

  local results=()
  for i in "${!pids[@]}"; do
    local pid="${pids[$i]}"
    local branch="${branches_running[$i]}"
    local slug
    slug=$(branch_to_slug "$branch")

    if wait "$pid"; then
      results+=("passed:$branch")
      success "$branch: tests PASSED"
    else
      results+=("failed:$branch")
      error   "$branch: tests FAILED  (see $LOG_DIR/$slug.log)"
    fi
  done

  echo ""
  print_summary "${results[@]}"
}

# ── Summary ───────────────────────────────────────────────────────────────────

print_summary() {
  local results=("$@")
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  E2E Test Summary"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local any_failed=0
  for result in "${results[@]}"; do
    local status="${result%%:*}"
    local branch="${result#*:}"
    local slug
    slug=$(branch_to_slug "$branch")

    if [[ "$status" == "passed" ]]; then
      echo -e "  ${GREEN}✔${NC}  $branch"
    else
      echo -e "  ${RED}✘${NC}  $branch  →  $LOG_DIR/$slug.log"
      any_failed=1
    fi
  done

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  return "$any_failed"
}

# ── Cleanup ───────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  log "Cleaning up..."
  unmount_symlinks

  for branch in "${BRANCHES[@]}"; do
    [[ "$branch" == "master" ]] && continue
    local slug
    slug=$(branch_to_slug "$branch")
    local path="$WORKTREE_BASE/$slug"
    if [[ -d "$path" ]]; then
      git worktree remove --force "$path" 2>/dev/null || true
    fi
  done

  git worktree prune
  success "Done."
}

# ── Usage ─────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --no-cleanup    Keep worktrees and symlinks after tests finish
  --setup-only    Create worktrees + symlinks but don't run tests
  --help          Show this message

Environment overrides:
  TEST_CMD        Command to run in each e2e dir  (default: $TEST_CMD)
  E2E_DIR         Sparse checkout path            (default: $E2E_DIR)
  WORKTREE_BASE   Where to create worktrees       (default: $WORKTREE_BASE)
  LOG_DIR         Where to write logs             (default: $LOG_DIR)
EOF
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  local do_cleanup=true
  local setup_only=false

  for arg in "$@"; do
    case "$arg" in
      --no-cleanup)  do_cleanup=false ;;
      --setup-only)  setup_only=true  ;;
      --help|-h)     usage; exit 0    ;;
      *) error "Unknown option: $arg"; usage; exit 1 ;;
    esac
  done

  echo ""
  log "Branches : ${BRANCHES[*]}"
  log "Sparse   : /$E2E_DIR"
  log "Test cmd : $TEST_CMD"
  log "Repo     : $REPO_ROOT"
  echo ""

  preflight
  setup_all_worktrees
  mount_symlinks
  print_symlink_tree

  if [[ "$setup_only" == true ]]; then
    log "Setup only — skipping tests."
    if [[ "$do_cleanup" == false ]]; then
      log "Worktrees and symlinks left in place (--no-cleanup)."
    else
      cleanup
    fi
    exit 0
  fi

  if [[ "$do_cleanup" == true ]]; then
    trap cleanup EXIT INT TERM
  fi

  run_all_tests
}

main "$@"
