#!/bin/sh
# Initialize Garage via Admin API v2: assign layout, import known key, create bucket.
# Runs in an Alpine sidecar container since the Garage image is distroless.
set -e

ADMIN="http://garage:3903"
TOKEN="devadmintoken"

# Well-known dev credentials
ACCESS_KEY="GKdeadbeefdeadbeefdeadbeef"
SECRET_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

apk add --no-cache -q curl jq >/dev/null 2>&1

api() {
  # $1 = method, $2 = path, $3 = body (optional)
  if [ -n "$3" ]; then
    curl -sf -X "$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$3" "$ADMIN$2"
  else
    curl -sf -X "$1" -H "Authorization: Bearer $TOKEN" "$ADMIN$2"
  fi
}

echo "Waiting for Garage admin API..."
for i in $(seq 1 30); do
  if api GET /v2/GetClusterStatus >/dev/null 2>&1; then
    echo "Garage admin API is ready."
    break
  fi
  sleep 2
done

# --- Layout ---
NODE_ID=$(api GET /v2/GetClusterStatus | jq -r '.nodes[0].id')
echo "Node: $NODE_ID"

LAYOUT_VER=$(api GET /v2/GetClusterLayout | jq -r '.version')
echo "Current layout version: $LAYOUT_VER"

if [ "$LAYOUT_VER" = "0" ]; then
  echo "Assigning layout..."
  api POST /v2/UpdateClusterLayout \
    "{\"roles\":[{\"id\":\"$NODE_ID\",\"zone\":\"dc1\",\"capacity\":1073741824,\"tags\":[]}]}" \
    >/dev/null

  echo "Applying layout (version 1)..."
  api POST /v2/ApplyClusterLayout '{"version":1}' >/dev/null
  echo "Layout applied."
else
  echo "Layout already applied (version $LAYOUT_VER)."
fi

# --- Import API key ---
echo "Importing API key..."
api POST /v2/ImportKey \
  "{\"accessKeyId\":\"$ACCESS_KEY\",\"secretAccessKey\":\"$SECRET_KEY\",\"name\":\"pa-dev-key\"}" \
  >/dev/null 2>&1 || echo "  (key already exists)"

# --- Create bucket ---
echo "Creating bucket..."
api POST /v2/CreateBucket '{"globalAlias":"metabase-product-analytics"}' >/dev/null 2>&1 || echo "  (bucket already exists)"

# --- Allow key on bucket ---
echo "Granting bucket access..."
BUCKET_ID=$(api GET "/v2/GetBucketInfo?globalAlias=metabase-product-analytics" | jq -r '.id')
if [ -n "$BUCKET_ID" ] && [ "$BUCKET_ID" != "null" ]; then
  api POST /v2/AllowBucketKey \
    "{\"bucketId\":\"$BUCKET_ID\",\"accessKeyId\":\"$ACCESS_KEY\",\"permissions\":{\"read\":true,\"write\":true,\"owner\":true}}" \
    >/dev/null 2>&1 || true
  echo "  Granted key -> bucket $BUCKET_ID"
fi

echo ""
echo "==== Garage ready ===="
echo "  Endpoint:   http://localhost:3900"
echo "  Access Key: $ACCESS_KEY"
echo "  Secret Key: $SECRET_KEY"
echo "  Bucket:     metabase-product-analytics"
echo ""
