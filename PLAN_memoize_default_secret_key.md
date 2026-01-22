# Plan: Convert `default-secret-key` to Memoized Function

## Goal
Convert `default-secret-key` from a `defonce` binding to a memoized function so the value can be recalculated when `env/env` changes (e.g., during testing).

## File to Modify
- `/Users/edwardpaget/Projects/metabase/src/metabase/util/encryption.clj`

## Implementation Steps

### Step 1: Change `defonce` to a memoized function

Replace:
```clojure
(def ^:private ^{:tag 'bytes} default-secret-key
  (validate-and-hash-secret-key (env/env :mb-encryption-secret-key)))
```

With:
```clojure
(def ^:private default-secret-key*
  "Memoized function that hashes the secret key. Takes the raw key as argument
   so memoization correctly detects when the env value changes."
  (memoize
   (fn [secret-key-from-env]
     (validate-and-hash-secret-key secret-key-from-env))))

(defn ^:private default-secret-key
  "Returns the hashed default encryption secret key, memoized for performance.
   Automatically recalculates if the env var value changes."
  ^bytes []
  (default-secret-key* (env/env :mb-encryption-secret-key)))
```

**Key insight**: By passing `(env/env :mb-encryption-secret-key)` as an argument to the memoized function, the memoization will automatically return the cached value when the env value is the same, but recompute when it changes. No manual cache clearing needed for env changes.

### Step 2: (Optional) Add a function to reset the memoization cache

Since the memoization now keys on the env value itself, the cache will automatically recompute when the env changes. However, we may still want a reset function for testing edge cases (e.g., clearing all cached entries):

```clojure
(defn reset-default-secret-key!
  "Clears all memoized secret key hashes. Normally not needed since the cache
   automatically handles env changes, but useful for testing."
  []
  (memoize/memo-clear! default-secret-key*))
```

This requires adding `[clojure.core.memoize :as memoize]` to the requires. **This step is optional** - we can skip it if tests don't require clearing the entire cache.

### Step 3: Update all usages to call it as a function

Replace all occurrences of `default-secret-key` with `(default-secret-key)`:

| Line | Current | Updated |
|------|---------|---------|
| 62 | `(boolean default-secret-key)` | `(boolean (default-secret-key))` |
| 67 | `(if default-secret-key` | `(if (default-secret-key)` |
| 68-70 | `(if default-secret-key "..." "...")` | `(if (default-secret-key) "..." "...")` |
| 79 | `(encrypt-bytes default-secret-key b)` | `(encrypt-bytes (default-secret-key) b)` |
| 93 | `(encrypt default-secret-key s)` | `(encrypt (default-secret-key) s)` |
| 104 | `(decrypt-bytes default-secret-key b)` | `(decrypt-bytes (default-secret-key) b)` |
| 117 | `(encrypt-stream default-secret-key input-stream)` | `(encrypt-stream (default-secret-key) input-stream)` |
| 130 | `(encrypt-for-stream default-secret-key input)` | `(encrypt-for-stream (default-secret-key) input)` |
| 139 | `(maybe-decrypt-stream default-secret-key input-stream)` | `(maybe-decrypt-stream (default-secret-key) input-stream)` |
| 164 | `(decrypt default-secret-key s)` | `(decrypt (default-secret-key) s)` |
| 171 | `(maybe-encrypt default-secret-key s)` | `(maybe-encrypt (default-secret-key) s)` |
| 183 | `(maybe-encrypt-bytes default-secret-key b)` | `(maybe-encrypt-bytes (default-secret-key) b)` |
| 193 | `(maybe-encrypt-for-stream default-secret-key s)` | `(maybe-encrypt-for-stream (default-secret-key) s)` |
| 235 | `(cons default-secret-key args)` | `(cons (default-secret-key) args)` |

### Step 4: (Only if Step 2 is included) Add require for clojure.core.memoize

If adding the `reset-default-secret-key!` function, add to the `:require` block:
```clojure
[clojure.core.memoize :as memoize]
```

Note: `clojure.core/memoize` (used in Step 1) is built-in and requires no import. Only `clojure.core.memoize` (the contrib library) is needed for `memo-clear!`.

## Verification

1. Run the encryption tests:
   ```
   clojure -X:dev:test :only metabase.util.encryption-test
   ```

2. Test that memoization automatically detects env changes:
   ```clojure
   ;; In REPL
   (require '[metabase.util.encryption :as encryption])
   (require '[environ.core :as env])

   ;; Check initial state (probably false if no key set)
   (encryption/default-encryption-enabled?)

   ;; Set a new key
   (alter-var-root #'env/env assoc :mb-encryption-secret-key "some-test-key-16chars")

   ;; Should now return true - memoization detects the env change automatically
   (encryption/default-encryption-enabled?)

   ;; Remove the key
   (alter-var-root #'env/env dissoc :mb-encryption-secret-key)

   ;; Should return false again
   (encryption/default-encryption-enabled?)
   ```
