set -euo pipefail # exit the script if anything fails

# TODO: get these from the args and eventually workflow parameters
FE_GIT_REF="npretto-sdk-tests-test-frontend-console-log"
BE_GIT_REF="master"

# get the absolute path of the script so we can cd to a subfolder and reliably get back to it
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
TMP_FOLDER="$SCRIPT_DIR/tmp"
FE_FOLDER="$TMP_FOLDER/metabase-fe"
BE_FOLDER="$TMP_FOLDER/metabase-be"
JAR_PATH="$BE_FOLDER/target/uberjar/metabase.jar"

echo "TMP_FOLDER: $TMP_FOLDER"
echo "FE_FOLDER: $FE_FOLDER"
echo "BE_FOLDER: $BE_FOLDER"
echo "JAR_PATH: $JAR_PATH"


function build() {
  echo "Cleaning up tmp folder..."
  rm -rf "$TMP_FOLDER"
  mkdir -p "$TMP_FOLDER"
  echo "*" > "$TMP_FOLDER/.gitignore"

  echo "Cloning frontend..."
  git clone --depth 1 -b "$FE_GIT_REF" https://github.com/metabase/metabase.git "$FE_FOLDER"

  echo "Cloning backend..."
  git clone --depth 1 -b "$BE_GIT_REF" https://github.com/metabase/metabase.git "$BE_FOLDER"

  echo "Building frontend..."
  cd "$FE_FOLDER"
  yarn install
  yarn build

  echo "Copying frontend build to backend..."

  cp -r "$FE_FOLDER/resources/frontend_client" "$BE_FOLDER/resources"
  cp -r "$FE_FOLDER/resources/frontend_shared" "$BE_FOLDER/resources"

  echo "Building uberjar..."
  cd "$BE_FOLDER"
  clojure -X:drivers:build:build/all :steps '[:version :translations :licenses :drivers :uberjar]' # this command skips building the frontend, otherwise we'd overwrite the one we copied in resources/

  # TODO: remove but i'm keeping it for now as it's useful :)
  say "build done"
}

function run() {
  echo "\n\nStarting the uberjar...\n\n"
  cd "$FE_FOLDER"
  mkdir -p "$FE_FOLDER/target/uberjar/"
  cp "$JAR_PATH" "$FE_FOLDER/target/uberjar/metabase.jar"

  # todo: check for specific file?
  if ls metabase.db* 1> /dev/null 2>&1; then
    rm metabase.db*
  fi

  MB_CONFIG_FILE_PATH='' MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE=true MB_ENABLE_TEST_ENDPOINTS=true MB_PREMIUM_EMBEDDING_TOKEN="$CYPRESS_ALL_FEATURES_TOKEN" MB_JETTY_PORT=4000 java -jar "$JAR_PATH"
}

function test() {
  cd "$BE_FOLDER"
  echo "creating snapshot..."
  node e2e/runner/run_cypress_ci.js snapshot

  cd "$FE_FOLDER"
  echo "waiting for backend to be ready..."
  while ! curl -s http://localhost:4000/api/session/properties > /dev/null; do
    sleep 1
  done
  echo "backend is ready"

  echo "running tests..."
  BACKEND_PORT=4000 TEST_SUITE="e2e" yarn test-cypress
}

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <build|run|test>"
  exit 1
fi

case "$1" in
  build)
    build
    ;;
  run)
    run
    ;;
  test)
    test
    ;;
  *)
    echo "Usage: $0 <build|run|test>"
    exit 1
    ;;
esac
