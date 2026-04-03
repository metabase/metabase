# nix/tests/api-smoke.nix
#
# Integration test: Verify /api/session/properties returns valid JSON with version.
#
{ pkgs, metabase }:

let
  testLib = import ./lib.nix { inherit pkgs metabase; };
in
testLib.mkMetabaseTest {
  name = "mb-test-api-smoke";
  pgPort = 5434;
  mbPort = 3457;
  runtimeInputs = [ pkgs.jq ];
  testBody = ''
    echo "Testing /api/session/properties..."
    RESPONSE=$(curl -sf "http://localhost:$MB_PORT/api/session/properties")
    VERSION=$(echo "$RESPONSE" | jq -r '.version.tag // empty')

    if [ -n "$VERSION" ]; then
      echo "PASS: API returned version $VERSION"
    else
      echo "FAIL: Could not extract version from response"
      echo "$RESPONSE" | jq . 2>/dev/null | head -20
      exit 1
    fi
  '';
}
