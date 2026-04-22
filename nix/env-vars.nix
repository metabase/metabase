# nix/env-vars.nix
#
# Shell environment variable fragment for Metabase development.
# Returns a shell script string that sets up the environment.
#
{ pkgs, packages }:

let
  jdk = packages.jdk;
in
''
  # Java
  export JAVA_HOME="${jdk}"
  export PATH="${jdk}/bin:$PATH"

  # Node
  export NODE_OPTIONS="--max-old-space-size=4096"

  # Metabase database configuration (local PostgreSQL)
  export MB_DB_TYPE="postgres"
  export MB_DB_HOST="localhost"
  export MB_DB_PORT="5432"
  export MB_DB_DBNAME="metabase"
  export MB_DB_USER="$USER"

  # PostgreSQL data directory (project-local)
  export PGDATA="$PWD/.pgdata"
  export PGHOST="$PWD/.pgsocket"

  # Debug support
  if [ -n "''${MB_NIX_DEBUG:-}" ]; then
    echo "[metabase-nix] Debug mode enabled (MB_NIX_DEBUG=$MB_NIX_DEBUG)"
    echo "[metabase-nix] JAVA_HOME=$JAVA_HOME"
    echo "[metabase-nix] PGDATA=$PGDATA"
    echo "[metabase-nix] PGHOST=$PGHOST"
    set -x
  fi
''
