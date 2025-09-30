if [ "$#" -ne 2 ]; then
  echo "Usage: $0  <action> <collection_id>"
  exit 1
fi

ACTION="$1"
COLLECTION_ID="$2"

curl -X POST http://localhost:3000/api/ee/representation/collection/${COLLECTION_ID}/${ACTION} \
  -H 'Accept: application/json' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Connection: keep-alive' \
  -H 'Content-Type: application/json' \
  # add -b argument here
  -b 'metabase.DEVICE=2e82b500-91ae-4158-8dc1-eca0f3c06195; metabase.TIMEOUT=alive; ajs_anonymous_id=%2275917aa9-8b1f-4f6a-9244-1479115803f4%22; metabase.SESSION=bf8925f1-8ce5-44ce-835e-8d696a5ebfa5' \
  -H 'If-Modified-Since: Thu, 4 Sep 2025 15:06:21 GMT' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36' \
  -H 'sec-ch-ua: "Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"'
