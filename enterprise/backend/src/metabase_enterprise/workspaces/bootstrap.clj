(ns metabase-enterprise.workspaces.bootstrap
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.config :as config]))

(def ^:private default-jar
  "Default path to the metabase uberjar. Override with MB_CHILD_JAR."
  "/tmp/metabase.jar")

(def ^:private heredoc-marker
  "Marker for the inlined config.yml heredoc. Long and specific enough that it
  will not collide with anything the YAML emitter produces."
  "__METABASE_WORKSPACE_BOOTSTRAP_CONFIG_EOF__")

(defn- slugify
  "Turn a workspace name into a safe slug for the child's workdir. Keeps
  `[a-z0-9-]`, collapses everything else to `-`, trims leading/trailing
  dashes, and falls back to `workspace` when the input has no usable
  characters."
  [s]
  (let [cleaned (-> (str s)
                    str/lower-case
                    (str/replace #"[^a-z0-9]+" "-")
                    (str/replace #"^-+|-+$" ""))]
    (if (str/blank? cleaned) "workspace" cleaned)))

(defn- render-script
  "Render the bootstrap bash script. `slug` is used for the workdir; `yaml` is
  the full config.yml contents inlined via heredoc.

  The script fetches `metadata.json` + `field_values.json` from the parent at
  run time — too large to embed and can change between invocations — and
  hands them to the child via `MB_TABLE_METADATA_PATH` / `MB_FIELD_VALUES_PATH`
  so `metabase.warehouses-rest.metadata-file-import` loads them at boot.

  The child runs as a background `java -jar` process. Its PID is recorded in
  `$WORKDIR/metabase.pid` so a re-run cleanly kills and replaces the old one.
  Stdout/stderr go to `$WORKDIR/metabase.log`."
  [{:keys [workspace-name slug yaml]}]
  (str
   "#!/usr/bin/env bash\n"
   "# Bootstrap a Metabase child instance for workspace " (pr-str workspace-name) ".\n"
   "#\n"
   "# Requires PARENT_URL and MB_API_KEY in the environment — used to fetch\n"
   "# metadata.json and field_values.json from the parent. Also requires\n"
   "# MB_PREMIUM_EMBEDDING_TOKEN so the child can load MB_CONFIG_FILE_PATH.\n"
   "#\n"
   "# Override defaults with env vars: MB_CHILD_PORT, MB_CHILD_JAR, MB_CHILD_WORKDIR.\n"
   "set -euo pipefail\n"
   "\n"
   ": \"${PARENT_URL:?PARENT_URL must be set (parent Metabase URL)}\"\n"
   ": \"${MB_API_KEY:?MB_API_KEY must be set (parent admin API key)}\"\n"
   "\n"
   "PORT=\"${MB_CHILD_PORT:-3001}\"\n"
   "JAR=\"${MB_CHILD_JAR:-" default-jar "}\"\n"
   "WORKDIR=\"${MB_CHILD_WORKDIR:-$HOME/.metabase-workspaces/" slug "}\"\n"
   "\n"
   "command -v java >/dev/null 2>&1 || { echo 'java not found on PATH' >&2; exit 1; }\n"
   "command -v curl >/dev/null 2>&1 || { echo 'curl not found on PATH' >&2; exit 1; }\n"
   "[[ -f \"$JAR\" ]] || { echo \"metabase jar not found at $JAR\" >&2; exit 1; }\n"
   "\n"
   "mkdir -p \"$WORKDIR\"\n"
   "umask 077\n"
   "cat > \"$WORKDIR/config.yml\" <<'" heredoc-marker "'\n"
   yaml
   (when-not (str/ends-with? yaml "\n") "\n")
   heredoc-marker "\n"
   "chmod 600 \"$WORKDIR/config.yml\"\n"
   "\n"
   "echo \"Fetching metadata.json from $PARENT_URL...\"\n"
   "curl -fsS -H \"x-api-key: $MB_API_KEY\" \\\n"
   "  \"$PARENT_URL/api/database/metadata\" -o \"$WORKDIR/metadata.json\"\n"
   "echo \"Fetching field_values.json from $PARENT_URL...\"\n"
   "curl -fsS -H \"x-api-key: $MB_API_KEY\" \\\n"
   "  \"$PARENT_URL/api/database/field-values\" -o \"$WORKDIR/field_values.json\"\n"
   "chmod 600 \"$WORKDIR/metadata.json\" \"$WORKDIR/field_values.json\"\n"
   "\n"
   "# The :config-text-file feature (MB_CONFIG_FILE_PATH) and :disable-sync are both\n"
   "# premium-gated — fail fast rather than watch the child die during init.\n"
   ": \"${MB_PREMIUM_EMBEDDING_TOKEN:?MB_PREMIUM_EMBEDDING_TOKEN must be set (premium token with :config-text-file + :disable-sync)}\"\n"
   "\n"
   "# Stop any previous child recorded in the pidfile.\n"
   "if [[ -f \"$WORKDIR/metabase.pid\" ]]; then\n"
   "  OLD_PID=$(cat \"$WORKDIR/metabase.pid\" 2>/dev/null || true)\n"
   "  if [[ -n \"${OLD_PID:-}\" ]] && kill -0 \"$OLD_PID\" 2>/dev/null; then\n"
   "    echo \"Stopping previous child (pid=$OLD_PID)...\"\n"
   "    kill \"$OLD_PID\" 2>/dev/null || true\n"
   "    for _ in $(seq 1 30); do\n"
   "      kill -0 \"$OLD_PID\" 2>/dev/null || break\n"
   "      sleep 1\n"
   "    done\n"
   "    kill -9 \"$OLD_PID\" 2>/dev/null || true\n"
   "  fi\n"
   "  rm -f \"$WORKDIR/metabase.pid\"\n"
   "fi\n"
   "\n"
   "# Every MB_* env var on the host is inherited by the java process. Strip\n"
   "# the ones that would conflict with the child's own state before launch —\n"
   "# the child uses its own H2 app db in $WORKDIR, not the parent's app db.\n"
   "while IFS= read -r _name; do\n"
   "  unset \"$_name\"\n"
   "done < <(compgen -e | grep -E '^MB_DB_' || true)\n"
   "\n"
   "export MB_CONFIG_FILE_PATH=\"$WORKDIR/config.yml\"\n"
   "export MB_TABLE_METADATA_PATH=\"$WORKDIR/metadata.json\"\n"
   "export MB_FIELD_VALUES_PATH=\"$WORKDIR/field_values.json\"\n"
   "export MB_JETTY_PORT=\"$PORT\"\n"
   "export MB_DB_TYPE=h2\n"
   "export MB_DB_FILE=\"$WORKDIR/metabase.db\"\n"
   "\n"
   "cd \"$WORKDIR\"\n"
   "echo \"Starting metabase jar (workdir=$WORKDIR, port=$PORT)...\"\n"
   "nohup java -jar \"$JAR\" > \"$WORKDIR/metabase.log\" 2>&1 &\n"
   "CHILD_PID=$!\n"
   "disown || true\n"
   "echo \"$CHILD_PID\" > \"$WORKDIR/metabase.pid\"\n"
   "echo \"Child pid=$CHILD_PID, log=$WORKDIR/metabase.log\"\n"
   "\n"
   "echo \"Waiting for http://localhost:$PORT/api/health...\"\n"
   "for i in $(seq 1 120); do\n"
   "  if ! kill -0 \"$CHILD_PID\" 2>/dev/null; then\n"
   "    echo \"Child exited before becoming healthy — tail of $WORKDIR/metabase.log:\" >&2\n"
   "    tail -n 50 \"$WORKDIR/metabase.log\" >&2 || true\n"
   "    rm -f \"$WORKDIR/metabase.pid\"\n"
   "    exit 1\n"
   "  fi\n"
   "  if curl -fsS \"http://localhost:$PORT/api/health\" >/dev/null 2>&1; then\n"
   "    echo \"Ready: http://localhost:$PORT\"\n"
   "    exit 0\n"
   "  fi\n"
   "  sleep 2\n"
   "done\n"
   "\n"
   "echo \"Timed out waiting for http://localhost:$PORT/api/health\" >&2\n"
   "tail -n 50 \"$WORKDIR/metabase.log\" >&2 || true\n"
   "exit 1\n"))

(defn build-bootstrap-script
  "Return a self-contained bash script that starts a child Metabase instance
  preloaded with this workspace's config.yml. The child runs as a background
  `java -jar` process using the jar at `$MB_CHILD_JAR` (default `/tmp/metabase.jar`).
  Returns nil when the workspace does not exist. Propagates the 409 `ex-info`
  from `build-workspace-config` when any WorkspaceDatabase is not `:provisioned`."
  [ws]
  (when ws
    (let [cfg  (config/build-workspace-config (:id ws))
          yaml (config/config->yaml cfg)]
      (render-script {:workspace-name (:name ws)
                      :slug           (slugify (:name ws))
                      :yaml           yaml}))))
