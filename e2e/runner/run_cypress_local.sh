# options:
# --no-backend: use an already running backend
# --no-containers: run without docker containers
# --component: run component tests


# delete login cache or you will get 401s
rm -f e2e/support/cypress_sample_instance_data.json

# kill the backend if it's running
kill -9 $(lsof -t -i :4000) && echo "Backend was running, killed it"

export QA_DB_ENABLED=true
export TZ='US/Pacific'
export CYPRESS_FE_HEALTHCHECK=false
export MB_SNOWPLOW_AVAILABLE=true
export MB_SNOWPLOW_URL=http://localhost:9090
export MB_LOG_ANALYTICS=true

if [[ " $@ " == *" --oss "* ]]; then
  echo "✓ Running in OSS mode, many e2e test may fail"
else
  ## if there is no value set for CYPRESS EMBEDDING TOKEN
  if [ -z "$CYPRESS_ALL_FEATURES_TOKEN" ]; then
    echo "CYPRESS_ALL_FEATURES_TOKEN is not set. Either set it or run with -oss flag"
    exit 1
  fi

  # TODO: clean up this mess
  export MB_PREMIUM_EMBEDDING_TOKEN=$CYPRESS_ALL_FEATURES_TOKEN
  export MB_EMBEDDING_TOKEN=$CYPRESS_ALL_FEATURES_TOKEN
  export MB_EDITION='ee'
fi

if [[ " $@ " == *" --from-code "* ]]; then
  echo "Running from code instead of jar"
  MB_JETTY_PORT=4000 clojure -M:run:dev:ee
  # wait until the healthcheck passes
  while ! curl -s 'http://localhost:3000/api/health' | grep '{"status":"ok"}'; do sleep 1; done

elif [[ " $@ " == *" --no-backend "* ]]; then
  echo "Running without backend"
  export E2E_HOST=${E2E_HOST-'http://localhost:3000'}
else
  unset E2E_HOST
  # build the backend
  ./bin/build-for-test
fi

if [[ " $@ " == *" --from-code "* ]]; then
  echo "Running from code instead of jar"
  clojure -M:run:dev:ee
fi

if [[ " $@ " == *" --no-containers "* ]]; then
  echo "✓ Running without e2e docker containers, some tests may fail"
  unset QA_DB_ENABLED
else
  echo "✓ Starting all e2e docker containers"
  docker compose -f e2e/test/scenarios/docker-compose.yml up -d --quiet
fi

# run cypress
echo "run cypress!"

if [[ " $@ " == *" --component "* ]]; then
  node ./e2e/runner/run_cypress_local.js --open --component
else
  node ./e2e/runner/run_cypress_local.js --open --e2e
fi

# TODO: make sure the frontend is up

function cleanup {
  echo "Cleaning up..."
  docker compose -f e2e/test/scenarios/docker-compose.yml down
  exit 0
}

trap cleanup EXIT
trap cleanup SIGINT
trap cleanup INT
