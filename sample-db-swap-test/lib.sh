#!/usr/bin/env bash
# Process control + REST API helpers. Source config.sh first.
JAVA_ADDOPENS="${JAVA_ADDOPENS:---add-opens java.base/java.nio=ALL-UNNAMED --add-opens java.base/sun.security.util=ALL-UNNAMED}"

start_jar() {   # start_jar <tag> <jar>
  local tag="$1" jar="$2" log="${LOG_DIR}/$1.log"
  [ -f "${jar}" ] || { echo "FATAL: jar not found: ${jar}"; exit 1; }
  echo ">> starting [${tag}]  ${jar}"
  echo ">>   log: ${log}"
  ( cd "${REPO_DIR}" && exec java ${JAVA_ADDOPENS} -jar "${jar}" ) >"${log}" 2>&1 &
  echo $! >"${PID_FILE}"
}

stop_mb() {
  [ -f "${PID_FILE}" ] || return 0
  local pid; pid="$(cat "${PID_FILE}")"
  if kill -0 "${pid}" 2>/dev/null; then
    echo ">> stopping pid ${pid}"
    kill "${pid}" 2>/dev/null || true
    for _ in $(seq 1 30); do kill -0 "${pid}" 2>/dev/null || break; sleep 1; done
    kill -9 "${pid}" 2>/dev/null || true
  fi
  rm -f "${PID_FILE}"
}

wait_ready() {
  echo -n ">> waiting for ${BASE_URL}/api/health "
  for _ in $(seq 1 "${READY_TIMEOUT}"); do
    curl -sf "${BASE_URL}/api/health" >/dev/null 2>&1 && { echo " ready"; return 0; }
    echo -n "."; sleep 1
  done
  echo " TIMEOUT"; tail -40 "${LOG_DIR}"/*.log 2>/dev/null; return 1
}

save_state() { { echo "SESSION=${SESSION:-}"; echo "SAMPLE_DB_ID=${SAMPLE_DB_ID:-}"; } >"${STATE_FILE}"; }
load_state() { [ -f "${STATE_FILE}" ] && . "${STATE_FILE}" || true; }

api_get()  { curl -sf -H "X-Metabase-Session: ${SESSION}" "${BASE_URL}$1"; }
api_post() { curl -sf -H "X-Metabase-Session: ${SESSION}" -H 'Content-Type: application/json' -X POST -d "$2" "${BASE_URL}$1"; }

setup_or_login() {
  local token
  token="$(curl -sf "${BASE_URL}/api/session/properties" | jq -r '.["setup-token"] // empty')"
  if [ -n "${token}" ]; then
    echo ">> fresh install - running setup"
    SESSION="$(curl -sf -H 'Content-Type: application/json' -X POST "${BASE_URL}/api/setup" -d "$(jq -n \
      --arg t "${token}" --arg e "${ADMIN_EMAIL}" --arg p "${ADMIN_PASSWORD}" '{
        token:$t, user:{first_name:"Admin",last_name:"User",email:$e,password:$p,site_name:"SwapTest"},
        prefs:{site_name:"SwapTest",allow_tracking:false}}')" | jq -r '.id')"
  else
    echo ">> existing install - logging in"
    SESSION="$(curl -sf -H 'Content-Type: application/json' -X POST "${BASE_URL}/api/session" -d "$(jq -n \
      --arg u "${ADMIN_EMAIL}" --arg p "${ADMIN_PASSWORD}" '{username:$u,password:$p}')" | jq -r '.id')"
  fi
  [ -n "${SESSION}" ] && [ "${SESSION}" != "null" ] || { echo "FATAL: no session"; return 1; }
}

# Sets SAMPLE_DB_ID + SAMPLE_ENGINE from the is_sample database.
find_sample_db() {
  local sample; sample="$(api_get '/api/database' | jq -c '(.data // .) | map(select(.is_sample==true)) | .[0] // empty')"
  [ -n "${sample}" ] || { echo "no sample database found"; return 1; }
  SAMPLE_DB_ID="$(echo "${sample}" | jq -r '.id')"
  SAMPLE_ENGINE="$(echo "${sample}" | jq -r '.engine')"
  echo ">> sample DB: id=${SAMPLE_DB_ID} engine=${SAMPLE_ENGINE}"
}

# Field id by table + column name (from the sample DB metadata).
sample_field_id() {  # sample_field_id <TABLE> <FIELD>
  api_get "/api/database/${SAMPLE_DB_ID}/metadata" \
    | jq -r --arg t "$1" --arg f "$2" '.tables[] | select(.name==$t) | .fields[] | select(.name==$f) | .id' | head -1
}
sample_table_id() { api_get "/api/database/${SAMPLE_DB_ID}/metadata" | jq -r --arg t "$1" '.tables[] | select(.name==$t) | .id' | head -1; }

create_card() { api_post '/api/card' "$1" | jq -r '.id'; }   # arg = full card JSON; echoes id

run_card() {  # run_card <id> -> "<rowcount>" or "ERROR: <msg>"
  local out; out="$(api_post "/api/card/$1/query" '{}' || echo '{}')"
  echo "${out}" | jq -r 'if .status=="completed" then (.data.rows|length|tostring) else ("ERROR: " + ((.error // "unknown")|tostring)) end'
}
