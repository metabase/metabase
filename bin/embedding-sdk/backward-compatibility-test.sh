
set -euo pipefail # exit the script if anything fails

# TODO: get these from the args and eventually workflow parameters
FE_GIT_REF="npretto-sdk-tests-test-frontend-console-log"
BE_GIT_REF="master"

# get the absolute path of the script so we can cd to a subfolder and reliably get back to it
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
TMP_FOLDER="$SCRIPT_DIR/tmp"
FE_FOLDER="$TMP_FOLDER/metabase-fe"
BE_FOLDER="$TMP_FOLDER/metabase-be"
echo "TMP_FOLDER: $TMP_FOLDER"
echo "FE_FOLDER: $FE_FOLDER"
echo "BE_FOLDER: $BE_FOLDER"

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

say "build done"

echo "Starting the uberjar..."
cd "$BE_FOLDER"

MB_PREMIUM_EMBEDDING_TOKEN="$CYPRESS_ALL_FEATURES_TOKEN" java -jar "target/uberjar/metabase.jar"

