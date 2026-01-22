# OIDC Implementation Security Analysis

**Date:** 2026-01-19
**Scope:** `metabase.sso.oidc.*` and `metabase.sso.providers.oidc`

## Executive Summary

This document provides a security analysis of the OIDC (OpenID Connect) authentication implementation in Metabase. The implementation includes several strong security measures but has areas that require attention, particularly around redirect URL validation and caching mechanisms.

---

## High Severity Issues

### 1. Open Redirect Vulnerability - FIXED

**Locations:**
- `src/metabase/sso/oidc/state.clj:70-111` (validation functions)
- `src/metabase/sso/oidc/state.clj:136` (validation call in create-oidc-state)

**Description:**

~~The redirect URL stored in the encrypted state cookie is used directly after authentication completes without validation.~~

**FIXED:** The `create-oidc-state` function now validates redirect URLs before storing them. The validation:
- Accepts relative URLs starting with `/` (but rejects protocol-relative URLs like `//evil.com`)
- Accepts absolute URLs only if they have the same origin as the configured `site-url`
- Rejects all other URLs including `javascript:`, `data:`, and external domains

**Implementation:**

```clojure
;; New validation functions added to state.clj:
(defn valid-redirect-url?
  "Validates that a redirect URL is safe for use after OIDC authentication."
  ([redirect-url] (valid-redirect-url? redirect-url (system.settings/site-url)))
  ([redirect-url site-url]
   (cond
     (or (nil? redirect-url) (str/blank? redirect-url)) false
     (relative-url? redirect-url) true  ; /path is OK, //evil.com is not
     :else (same-origin? redirect-url site-url))))

;; Validation is called in create-oidc-state:
(validate-redirect-url! redirect)  ; throws on invalid URL
```

**Tests:** See `test/metabase/sso/oidc/state_test.clj`:
- `valid-redirect-url-test` - comprehensive URL validation tests
- `create-oidc-state-rejects-invalid-redirects-test` - integration tests for rejection
- `wrap-oidc-redirect-test` - tests open redirect protection in high-level API

---

## Medium Severity Issues

### 2. JWKS Cache Has No Expiration - FIXED

**Location:** `src/metabase/sso/oidc/tokens.clj:11-45`

**Description:**

~~The JWKS (JSON Web Key Set) cache is implemented as a simple atom with no TTL or size limits.~~

**FIXED:** The JWKS cache now includes TTL-based expiration:

- Cache entries expire after 1 hour (3600000 ms)
- Expired entries trigger automatic re-fetch from the IdP
- New `invalidate-jwks-cache!` function allows manual cache invalidation for specific URIs

**Implementation:**

```clojure
(def ^:private jwks-cache
  "Cache of JWKS with TTL. Map of JWKS URI string -> {:jwks map :fetched-at timestamp}."
  (atom {}))

(def ^:private jwks-cache-ttl-ms
  "JWKS cache TTL: 1 hour."
  3600000)

(defn- cache-expired? [cache-entry]
  (or (nil? cache-entry)
      (nil? (:fetched-at cache-entry))
      (> (- (System/currentTimeMillis) (:fetched-at cache-entry))
         jwks-cache-ttl-ms)))

(defn invalidate-jwks-cache! [jwks-uri]
  "Invalidate cached JWKS for a specific URI."
  (swap! jwks-cache dissoc jwks-uri))
```

**Tests:** See `test/metabase/sso/oidc/tokens_test.clj`:
- `jwks-cache-uses-cached-entry-when-fresh-test`
- `jwks-cache-refetches-when-expired-test`
- `invalidate-jwks-cache-test`

---

### 3. Discovery Document Cache Has No Expiration - FIXED

**Location:** `src/metabase/sso/oidc/discovery.clj:11-14`

**Description:**

~~Similar to the JWKS cache, the discovery document cache has no TTL.~~

**FIXED:** The discovery document cache now includes TTL-based expiration:

- Cache entries expire after 24 hours (86400000 ms)
- Expired entries trigger automatic re-fetch from the IdP
- New `invalidate-cache!` function allows manual cache invalidation for specific issuers
- Cache refresh events are logged for audit purposes

**Implementation:**

```clojure
(def ^:private discovery-cache
  "Cache of discovery documents with TTL.
   Map of issuer URL string -> {:document discovery-map :fetched-at timestamp}."
  (atom {}))

(def ^:private discovery-cache-ttl-ms
  "Discovery document cache TTL: 24 hours."
  86400000)

(defn- cache-expired? [cache-entry]
  (or (nil? cache-entry)
      (nil? (:fetched-at cache-entry))
      (> (- (System/currentTimeMillis) (:fetched-at cache-entry))
         discovery-cache-ttl-ms)))

(defn invalidate-cache! [issuer]
  "Invalidate cached discovery document for a specific issuer."
  (let [normalized (normalize-issuer issuer)]
    (swap! discovery-cache dissoc normalized)
    (log/infof "Invalidated discovery cache for issuer %s" normalized)))
```

**Tests:** See `test/metabase/sso/oidc/discovery_test.clj`:
- `discovery-cache-uses-cached-entry-when-fresh-test`
- `discovery-cache-refetches-when-expired-test`
- `invalidate-discovery-cache-test`
- `invalidate-discovery-cache-with-trailing-slash-test`

---

### 4. Missing SSRF Protection on External URL Fetches

**Locations:**
- `src/metabase/sso/oidc/discovery.clj:27-46`
- `src/metabase/sso/oidc/tokens.clj:20-33`

**Description:**

When fetching discovery documents and JWKS, there's no validation preventing requests to internal network addresses:

```clojure
;; discovery.clj
(http/get url {:as :json ...})

;; tokens.clj
(http/get jwks-uri {:as :json ...})
```

**Security Impact:**

A malicious or compromised issuer configuration could:
- Make requests to internal services (SSRF)
- Probe internal network topology
- Access cloud metadata endpoints (e.g., `169.254.169.254`)

**Recommendation:**

Use the existing `metabase.util.http/valid-host?` function:

```clojure
(require '[metabase.util.http :as u.http])

(defn- fetch-discovery-document [issuer]
  (let [url (discovery-url issuer)]
    (when-not (u.http/valid-host? :external-only url)
      (throw (ex-info "Invalid issuer URL: internal addresses not allowed" {:url url})))
    ;; ... existing fetch logic
    ))
```

---

### 5. No PKCE Support

**Locations:**
- `src/metabase/sso/providers/oidc.clj:54-83`
- `src/metabase/sso/oidc/common.clj:29-49`

**Description:**

PKCE (Proof Key for Code Exchange) is not implemented. The authorization flow uses only the basic authorization code flow without code challenge/verifier.

**Security Impact:**

- Authorization code interception attacks are possible if an attacker can observe the callback URL
- OAuth 2.1 and current OIDC best practices recommend PKCE for all clients
- Some IdPs may require PKCE

**Recommendation:**

Add PKCE support:

```clojure
;; In common.clj
(defn generate-code-verifier
  "Generate a cryptographically random code verifier for PKCE."
  []
  (-> (nonce/random-bytes 32) codecs/bytes->b64-str
      (str/replace #"\+" "-")
      (str/replace #"/" "_")
      (str/replace #"=" "")))

(defn generate-code-challenge
  "Generate S256 code challenge from verifier."
  [verifier]
  (-> verifier
      codecs/str->bytes
      (buddy.core.hash/sha256)
      codecs/bytes->b64-str
      (str/replace #"\+" "-")
      (str/replace #"/" "_")
      (str/replace #"=" "")))

;; Add to authorization URL params:
{:code_challenge (generate-code-challenge code-verifier)
 :code_challenge_method "S256"}

;; Store code_verifier in state cookie, include in token exchange
```

---

### 6. Hardcoded RS256 Algorithm

**Location:** `src/metabase/sso/oidc/tokens.clj:74`

**Description:**

The JWT verification algorithm is hardcoded to RS256:

```clojure
(jwt/unsign token public-key {:alg :rs256})
```

**Security Impact:**

- Some IdPs use different algorithms (RS384, RS512, ES256)
- The JWK's `alg` field is not validated against the token's algorithm
- Could lead to interoperability issues or security misconfigurations

**Recommendation:**

```clojure
(def ^:private allowed-algorithms
  "Allowlist of acceptable JWT signing algorithms."
  #{:rs256 :rs384 :rs512 :es256 :es384 :es512})

(defn- get-algorithm [key-data]
  (let [alg (-> key-data :alg str/lower-case keyword)]
    (when-not (contains? allowed-algorithms alg)
      (throw (ex-info "Unsupported JWT algorithm" {:algorithm alg})))
    alg))

;; In verify-signature:
(let [alg (get-algorithm key-data)
      public-key (keys/jwk->public-key key-data)]
  (jwt/unsign token public-key {:alg alg}))
```

---

## Low Severity Issues

### 7. Missing Token Time Validations

**Location:** `src/metabase/sso/oidc/tokens.clj:128-166`

**Description:**

Token validation checks `exp` (expiry) but not:
- `iat` (issued at) - tokens issued far in the past could indicate replay
- `nbf` (not before) - respecting intended activation time
- `auth_time` - for session freshness requirements

**Recommendation:**

```clojure
(defn validate-issued-at
  "Validate that the token was issued recently (within acceptable window)."
  [claims max-age-seconds]
  (when-let [iat (:iat claims)]
    (let [now (quot (System/currentTimeMillis) 1000)
          age (- now iat)]
      (and (>= age 0) (<= age max-age-seconds)))))

(defn validate-not-before
  "Validate that the token is active (current time >= nbf)."
  [claims]
  (if-let [nbf (:nbf claims)]
    (let [now (quot (System/currentTimeMillis) 1000)]
      (>= now nbf))
    true)) ; nbf is optional
```

---

### 8. Missing `azp` Claim Validation

**Location:** `src/metabase/sso/oidc/tokens.clj:102-115`

**Description:**

When the audience (`aud`) claim is an array with multiple values, the OIDC spec recommends validating the `azp` (authorized party) claim equals the client_id.

**Recommendation:**

```clojure
(defn validate-authorized-party
  "Validate azp claim when aud is multi-valued."
  [claims expected-client-id]
  (let [aud (:aud claims)
        azp (:azp claims)]
    (if (and (sequential? aud) (> (count aud) 1))
      (= azp expected-client-id)
      true))) ; azp validation only required for multi-valued aud
```

---

### 9. Potential Sensitive Data in Error Logs

**Location:** `src/metabase/sso/providers/oidc.clj:79`

**Description:**

Token exchange error responses are logged in their entirety:

```clojure
(log/errorf "Token exchange failed: %s" (:body response))
```

Some IdP implementations may include sensitive information in error responses.

**Recommendation:**

Log only sanitized error information:

```clojure
(log/errorf "Token exchange failed: error=%s description=%s"
            (get-in response [:body :error])
            (get-in response [:body :error_description]))
```

---

### 10. SameSite=Lax Cookie Consideration

**Location:** `src/metabase/sso/oidc/state.clj:141-146`

**Description:**

The state cookie uses `SameSite=Lax`, which is required for OIDC flows (the cookie must be sent on the redirect back from the IdP). However, this means the cookie will be sent on top-level GET navigations from other sites.

**Impact:**

This is acceptable and necessary for OIDC but should be documented. The 10-minute TTL and cryptographic state validation mitigate most risks.

**Recommendation:**

- Document this trade-off in security documentation
- Ensure state TTL remains short (current 10 minutes is appropriate)
- Consider reducing TTL further if possible (e.g., 5 minutes)

---

## Positive Security Findings

The implementation includes several strong security measures:

| Feature | Implementation | Assessment |
|---------|---------------|------------|
| State Encryption | AES256-CBC-HMAC-SHA512 | Strong |
| Key Derivation | PBKDF2+SHA512 with 100k iterations | Strong |
| CSRF Protection | Cryptographically random state parameter | Correct |
| Nonce Validation | Prevents token replay | Correct |
| State TTL | 10-minute expiration | Appropriate |
| Issuer Validation | Exact match required | Correct |
| Audience Validation | Supports string and array formats | Correct |
| Cookie Security | HttpOnly, Secure (on HTTPS), path-restricted | Correct |
| Encryption Requirement | Enforces `MB_ENCRYPTION_SECRET_KEY` | Good |

---

## Remediation Priority

| Priority | Issue | Effort | Status |
|----------|-------|--------|--------|
| 1 | Open Redirect Vulnerability | Low | **FIXED** |
| 2 | JWKS Cache Expiration | Medium | **FIXED** |
| 3 | SSRF Protection | Low | Open |
| 4 | Discovery Cache Expiration | Medium | **FIXED** |
| 5 | PKCE Support | Medium | Open |
| 6 | Algorithm Flexibility | Low | Open |
| 7 | Token Time Validations | Low | Open |
| 8 | azp Claim Validation | Low | Open |
| 9 | Log Sanitization | Low | Open |

---

## References

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
