release-run () {
    cd "$RELEASE_REPO"
    ./bin/build
}

release-validate () {
  if ! [ -f "$RELEASE_REPO/target/uberjar/metabase.jar" ]; then
    echo "jar not built"
    return 1;
  fi
  # run the jar to get the version number
  version_info="$(java -jar "$RELEASE_REPO/target/uberjar/metabase.jar" version | grep -oE '{[^}]+}')"
  actual_version="$(echo "$version_info" | grep -oE ':tag [^,}]+' | cut -c 6-)"
  expected_version="v$VERSION"
  if [ "$actual_version" != "$expected_version" ]; then
      echo "INCORRECT version '$actual_version', expected '$expected_version'";
      return 1;
  fi
}
