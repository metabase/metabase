DEFAULT_KEYSTORE_PATH="$RELEASE_ROOT/certs/metabase_keystore.jks"
# ensure we have access to the keystore
if [ -z ${KEYSTORE_PATH+x} ]; then
    echo "Using default KEYSTORE_PATH.";
    KEYSTORE_PATH="$DEFAULT_KEYSTORE_PATH"
fi

release-dependencies () {
  echo "$KEYSTORE_PATH"
  if ! [ -f "$KEYSTORE_PATH" ]; then
      echo "Can't find Keystore with Jar signing key"
      return 1
  fi
}

release-run () {
  jarsigner -tsa "http://timestamp.digicert.com" -keystore "$KEYSTORE_PATH" "$RELEASE_REPO/target/uberjar/metabase.jar" server
}

release-validate () {
  jarsigner -verify "$RELEASE_REPO/target/uberjar/metabase.jar"
}
