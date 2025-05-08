set -euo pipefail # exit the script if anything fails

INSTRUCTIONS="Usage: bash bin/backward-compatibility-test.sh \$FE_GIT_REF \$BE_GIT_REF <build|start|test>"

FE_GIT_REF=$1
BE_GIT_REF=$2

# save some absolute paths so that later we can cd to a subfolder and reliably get back to it
TMP_FOLDER="$(pwd)/.tmp"
FE_FOLDER="$TMP_FOLDER/metabase-fe"
BE_FOLDER="$TMP_FOLDER/metabase-be"
JAR_PATH="$BE_FOLDER/target/uberjar/metabase.jar"

echo "Using frontend from $FE_GIT_REF"
echo "Using backend from $BE_GIT_REF"
echo "---"
echo "To test locally run:" # log for ci
echo "sh bin/backward-compatibility-test.sh $FE_GIT_REF $BE_GIT_REF <build|start|test>"
echo "---"
echo "TMP_FOLDER: $TMP_FOLDER"
echo "FE_FOLDER: $FE_FOLDER"
echo "BE_FOLDER: $BE_FOLDER"
echo "JAR_PATH: $JAR_PATH"


function print_step() {
  echo "---"
  echo "$1"
  echo "---"
}


function build() {
  print_step "Cleaning up tmp folder..."
  rm -rf "$TMP_FOLDER"
  mkdir -p "$TMP_FOLDER"
  echo "*" > "$TMP_FOLDER/.gitignore"

  print_step "Cloning frontend..."
  git clone --depth 1 -b "$FE_GIT_REF" https://github.com/metabase/metabase.git "$FE_FOLDER"

  print_step "Cloning backend..."
  git clone --depth 1 -b "$BE_GIT_REF" https://github.com/metabase/metabase.git "$BE_FOLDER"

  echo "Building frontend..."
  cd "$FE_FOLDER"
  yarn install
  MB_EDITION=ee yarn build

  print_step "Copying frontend build to backend..."

  cp -r "$FE_FOLDER/resources/frontend_client" "$BE_FOLDER/resources"
  cp -r "$FE_FOLDER/resources/frontend_shared" "$BE_FOLDER/resources"

  print_step "Building uberjar..."
  cd "$BE_FOLDER"
  MB_EDITION=ee clojure -X:drivers:build:build/all :steps '[:version :translations :drivers :uberjar]' # this command skips building the frontend, otherwise we'd overwrite the one we copied in resources/
}

function start() {
  print_step "Starting the uberjar..."

  if [ -f metabase.db.mv.db ]; then
    rm metabase.db.mv.db
  fi
  if [ -f metabase.db ]; then
    rm metabase.db
  fi


  MB_CONFIG_FILE_PATH='' MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE=true MB_ENABLE_TEST_ENDPOINTS=true MB_PREMIUM_EMBEDDING_TOKEN="$CYPRESS_ALL_FEATURES_TOKEN" MB_JETTY_PORT=4000 java -jar "$JAR_PATH"
}

function test() {
  cd "$FE_FOLDER"
  print_step "Waiting for backend to be ready..."
  while ! curl -s 'http://localhost:4000/api/health' | grep '{"status":"ok"}'; do sleep 1; done
  print_step "Backend is ready"

  print_step "Creating snapshot..."
  node e2e/runner/run_cypress_ci.js snapshot

  print_step "Running tests..."
  BACKEND_PORT=4000 TEST_SUITE="e2e" node e2e/runner/run_cypress_ci.js e2e --env grepTags="--@flaky --@external",grepOmitFiltered=true --spec "e2e/test/scenarios/dashboard/dashboard.cy.spec.js,e2e/test/scenarios/question/caching.cy.spec.js,e2e/test/scenarios/question/column-compare.cy.spec.ts"
}

if [ "$#" -ne 3 ]; then
  echo "$INSTRUCTIONS"
  exit 1
fi

case "$3" in
  build)
    build
    ;;
  start)
    start
    ;;
  test)
    test
    ;;
  *)
    echo "$INSTRUCTIONS"
    exit 1
    ;;
esac
