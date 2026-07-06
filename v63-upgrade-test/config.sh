# Shared config for the v63 cloud-upgrade simulation.
# Source this from the other scripts: `. "$(dirname "$0")/config.sh"`
# Override any value by exporting it before running a script.

# Repos
METABASE_DIR="${METABASE_DIR:-$HOME/Projects/metabase}"
EE_EXTRA_DIR="${EE_EXTRA_DIR:-$HOME/Projects/metabase-ee-extra}"

# The metabase branch whose CI uberjar we test (the H2-deferral changes).
MB_REF="${MB_REF:-defer-h2-loading}"

# The real production H2-removal script from metabase-ee-extra (strips classes + the ServiceLoader
# entry). The test runs this exact script so a reviewer validates the actual packaging step.
REMOVE_H2_SCRIPT="${REMOVE_H2_SCRIPT:-$EE_EXTRA_DIR/.github/scripts/remove-h2-from-jar.sh}"

# Admin user created on the seeded v62 instance (so the v63 upgrade takes the existing-install path).
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Metabot1!extra}"

# Work dirs
TEST_DIR="${TEST_DIR:-$METABASE_DIR/v63-upgrade-test}"
BUILD_DIR="${BUILD_DIR:-$TEST_DIR/build}"
CTX_DIR="${CTX_DIR:-$BUILD_DIR/ctx}"
JAR_FINAL="${JAR_FINAL:-$BUILD_DIR/metabase.jar}"

# Simulated release identity baked into the jar (must be major >= 63 to trip H2 removal)
FAKE_TAG="${FAKE_TAG:-v1.63.0}"

# Public EE image used BOTH as the Docker base for the v63 image AND as the v62 upgrade source.
# Override if a newer v62 patch exists: `EE_BASE_TAG=v1.62.20 ./04-run-v62.sh`
EE_BASE_TAG="${EE_BASE_TAG:-v1.62.3}"

# Built test image
V63_IMAGE="${V63_IMAGE:-mb-ee-extra:v63-test}"

# Docker names / networking
NET="${NET:-mb-v63-net}"
PG_CONTAINER="${PG_CONTAINER:-mb-v63-pg}"
PG_VOLUME="${PG_VOLUME:-mb-v63-appdb}"
PG_HOST="${PG_HOST:-pg}"          # hostname of pg on the docker network
MB_CONTAINER="${MB_CONTAINER:-mb-v63-app}"
MB_PORT="${MB_PORT:-3000}"

# App DB creds (shared across v62 and v63)
PG_USER="${PG_USER:-metabase}"
PG_PASS="${PG_PASS:-metabase}"
PG_DB="${PG_DB:-metabase}"

wait_for_health() {
  # Poll the metabase health endpoint on the host until 200 or timeout.
  local url="http://localhost:${MB_PORT}/api/health" secs="${1:-300}" i=0
  echo "Waiting for Metabase health at $url (timeout ${secs}s)..."
  while ! curl -sf "$url" >/dev/null 2>&1; do
    i=$((i+2)); sleep 2
    if [ "$i" -ge "$secs" ]; then
      echo "TIMEOUT waiting for health. Recent logs:"; docker logs --tail 60 "$MB_CONTAINER" || true
      return 1
    fi
  done
  echo "Healthy: $(curl -s "$url")"
}
