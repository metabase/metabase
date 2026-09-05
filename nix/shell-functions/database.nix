# nix/shell-functions/database.nix
#
# PostgreSQL helpers for the dev shell.
#
{ pkgs }:

let
  pg = pkgs.postgresql_18;
in
''
  pg-start() {
    local pgdata="''${PGDATA:-$PWD/.pgdata}"
    local pgsocket="''${PGHOST:-$PWD/.pgsocket}"

    mkdir -p "$pgsocket"

    if [ ! -d "$pgdata/base" ]; then
      echo "Initializing PostgreSQL database..."
      ${pg}/bin/initdb -D "$pgdata" --no-locale --encoding=UTF8
      echo "unix_socket_directories = '$pgsocket'" >> "$pgdata/postgresql.conf"
      echo "listen_addresses = 'localhost'" >> "$pgdata/postgresql.conf"
      echo "port = 5432" >> "$pgdata/postgresql.conf"
    fi

    if ${pg}/bin/pg_ctl -D "$pgdata" status > /dev/null 2>&1; then
      echo "PostgreSQL is already running."
      return 0
    fi

    echo "Starting PostgreSQL..."
    ${pg}/bin/pg_ctl -D "$pgdata" -l "$pgdata/postgresql.log" start
    echo "PostgreSQL started."
  }

  pg-stop() {
    local pgdata="''${PGDATA:-$PWD/.pgdata}"
    echo "Stopping PostgreSQL..."
    ${pg}/bin/pg_ctl -D "$pgdata" stop 2>/dev/null || echo "PostgreSQL not running."
  }

  pg-reset() {
    local pgdata="''${PGDATA:-$PWD/.pgdata}"
    pg-stop
    echo "Removing PostgreSQL data directory..."
    rm -rf "$pgdata"
    echo "Done. Run pg-start to reinitialize."
  }

  pg-create() {
    local dbname="''${1:-metabase}"
    echo "Creating database '$dbname'..."
    ${pg}/bin/createdb -h "$PGHOST" "$dbname" 2>/dev/null || echo "Database '$dbname' may already exist."
    echo "Done."
  }
''
