(ns metabase.util.encryption.dek
  "The **DEK store** seam for local envelope encryption.

  A *data-encryption key* (DEK) is 32 random bytes (an AES-256 key) minted by Metabase and stored — wrapped
  (encrypted) by the *key-encryption key* (KEK, the PBKDF2 hash of `MB_ENCRYPTION_SECRET_KEY`) — in the application
  database. One DEK *generation* is active; new v2 writes use it, and older generations stay readable forever.

  This namespace defines:

  - the [[DEKStore]] protocol (fetch active / fetch by id / mint / rewrap-all),
  - an [[in-memory-store]] implementation for tests,
  - the [[*store*]] dynamic var naming the store the encryption utilities should use, and
  - a small process-memory cache of *unwrapped* DEK material keyed by generation id.

  The app-DB-backed implementation lives in `metabase.app-db.dek-store`; keeping the protocol and the in-memory
  implementation here lets the encryption utilities and their tests use them without any dependency on the app DB."
  (:require
   [buddy.core.nonce :as nonce]
   [metabase.util.log :as log])
  (:import
   (java.util Arrays)
   (javax.crypto Cipher)
   (javax.crypto.spec GCMParameterSpec SecretKeySpec)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ KEK wrapping ------------------------------------------------

;; DEK material is wrapped under the KEK with AES-256-GCM. We use the first 32 bytes of the 64-byte KEK hash as the
;; AES-256 key. The wrapped blob is `nonce(12) ‖ GCM ciphertext+tag`. GCM authentication failure on unwrap is a
;; deterministic "wrong KEK" signal.

(def ^:private ^:const gcm-nonce-length 12)
(def ^:private ^:const gcm-tag-bits 128)
(def ^:private ^:const dek-length 32)

(defn- kek->aes-key
  "The AES-256 key half of a 64-byte KEK hash, as a `SecretKeySpec`."
  ^SecretKeySpec [^bytes kek]
  (SecretKeySpec. (Arrays/copyOfRange kek 0 32) "AES"))

(defn wrap-dek
  "Wrap (encrypt) 32-byte DEK material `dek` under 64-byte KEK hash `kek`, returning `nonce ‖ GCM ciphertext+tag`."
  ^bytes [^bytes kek ^bytes dek]
  (let [nonce  (nonce/random-bytes gcm-nonce-length)
        cipher (Cipher/getInstance "AES/GCM/NoPadding")]
    (.init cipher Cipher/ENCRYPT_MODE (kek->aes-key kek) (GCMParameterSpec. gcm-tag-bits nonce))
    (let [ct (.doFinal cipher dek)
          out (byte-array (+ gcm-nonce-length (alength ct)))]
      (System/arraycopy nonce 0 out 0 gcm-nonce-length)
      (System/arraycopy ct 0 out gcm-nonce-length (alength ct))
      out)))

(defn unwrap-dek
  "Unwrap (decrypt) `wrapped` (`nonce ‖ GCM ciphertext+tag`) under 64-byte KEK hash `kek`, returning the 32-byte DEK.
  Throws `javax.crypto.AEADBadTagException` (wrapped in the JCA exception) when `kek` is the wrong key — a
  deterministic wrong-key signal."
  ^bytes [^bytes kek ^bytes wrapped]
  (let [nonce  (Arrays/copyOfRange wrapped 0 gcm-nonce-length)
        ct     (Arrays/copyOfRange wrapped gcm-nonce-length (alength wrapped))
        cipher (Cipher/getInstance "AES/GCM/NoPadding")]
    (.init cipher Cipher/DECRYPT_MODE (kek->aes-key kek) (GCMParameterSpec. gcm-tag-bits nonce))
    (.doFinal cipher ct)))

(defn random-dek
  "Fresh 32 random bytes of AES-256 DEK material."
  ^bytes []
  (nonce/random-bytes dek-length))

;;; --------------------------------------------- DEK store protocol ---------------------------------------------

(defprotocol DEKStore
  "The seam over per-generation DEKs. `kek` is always the 64-byte KEK hash (the PBKDF2 hash of
  `MB_ENCRYPTION_SECRET_KEY`)."
  (active-generation [store kek]
    "Return `{:generation-id int, :dek ^bytes}` for the newest DEK generation, minting the first generation if none
     exists. `dek` is the unwrapped 32-byte key material.")
  (dek-by-id [store kek generation-id]
    "Return the unwrapped 32-byte DEK material for `generation-id`, or throw if it does not exist / does not unwrap.")
  (mint-generation! [store kek]
    "Mint a brand-new active generation and return `{:generation-id int, :dek ^bytes}`.")
  (rewrap-all! [store old-kek new-kek]
    "Rewrap every stored generation: unwrap under `old-kek`, re-wrap under `new-kek`. Returns the number of rows
     rewrapped.")
  (generation-ids [store]
    "Return a sorted vector of all known generation ids (for logging / tests)."))

;;; --------------------------------------- unwrapped-DEK process cache ----------------------------------------

;; Unwrapped DEK material is cached in process memory so the KEK unwrap happens at most once per generation per
;; process. The cache key is `[store-key kek-fingerprint generation-id]`:
;;
;;   - `store-key` partitions independent stores (in-memory stores in parallel tests, the app-DB store).
;;   - `kek-fingerprint` makes the cache KEK-sensitive: a value cached under one KEK is never served for a read
;;     attempted under a different KEK. This is what keeps wrong-key detection deterministic even for warm reads —
;;     unwrapping a DEK row (wrapped under KEK A) with KEK B misses the cache and fails on the GCM auth check instead
;;     of silently returning the cached plaintext DEK.
;;
;; A SHA-256 fingerprint (not the KEK itself) is used as the cache key so raw key material never sits in map keys.

(defonce ^:private dek-cache (atom {}))

;; The active (newest) generation id per store-key, cached so the app-DB store does not run `SELECT max(id)` on every
;; encrypted write. Invalidated whenever a generation is minted (a new active id) or the cache is cleared (rotation,
;; rewrap, decryption). Rewrap does not change which id is active, but callers clear the cache on rewrap anyway, so
;; this stays correct.
(defonce ^:private active-generation-cache (atom {}))

(defn clear-cache!
  "Drop all cached unwrapped DEK material and cached active-generation ids. Called on rotation / decryption / deep
  re-encryption so stale key material or a stale generation is never reused."
  []
  (reset! dek-cache {})
  (reset! active-generation-cache {}))

(defn cached-active-generation-id
  "Look up the cached active (newest) generation id for `store-key`, computing and caching it via `f` on a miss. `f`
  returns the newest generation id (or nil for an empty store, which is not cached so the next write re-checks)."
  [store-key f]
  (if-let [hit (get @active-generation-cache store-key)]
    hit
    (when-let [gen-id (f)]
      (swap! active-generation-cache assoc store-key gen-id)
      gen-id)))

(defn invalidate-active-generation!
  "Forget the cached active-generation id for `store-key` (call after minting a new generation)."
  [store-key]
  (swap! active-generation-cache dissoc store-key))

(defn- kek-fingerprint [^bytes kek]
  (when kek
    (vec (.digest (java.security.MessageDigest/getInstance "SHA-256") kek))))

(defn cached-dek
  "Look up cached unwrapped DEK material for `store-key`/`kek`/`generation-id`, computing and caching it via `f` on a
  miss. The cache is KEK-sensitive: material cached under one KEK is never served for a different KEK."
  ^bytes [store-key ^bytes kek generation-id f]
  (let [k [store-key (kek-fingerprint kek) generation-id]]
    (if-let [hit (get @dek-cache k)]
      hit
      (let [dek (f)]
        (swap! dek-cache assoc k dek)
        dek))))

(defn cache-put!
  "Directly cache unwrapped DEK material `dek` for `store-key`/`kek`/`generation-id` (e.g. just after minting)."
  [store-key ^bytes kek generation-id ^bytes dek]
  (swap! dek-cache assoc [store-key (kek-fingerprint kek) generation-id] dek)
  dek)

(defn ->bytes
  "Coerce `v` (a byte array or a JDBC `Blob`) to a byte array. DEK material read from the app DB may arrive as either."
  ^bytes [v]
  (if (instance? java.sql.Blob v)
    (let [^java.sql.Blob b v]
      (.getBytes b 1 (int (.length b))))
    v))

;;; ------------------------------------------- in-memory implementation -------------------------------------------

(defn- new-generation-id [rows]
  (if (empty? rows) 1 (inc (apply max (keys rows)))))

;; `rows` is `{generation-id wrapped-bytes}`. `id` is a unique object used as the cache store-key.
(deftype InMemoryDEKStore [id rows]
  DEKStore
  (active-generation [store kek]
    (if (empty? @rows)
      (mint-generation! store kek)
      (let [gen-id (apply max (keys @rows))]
        {:generation-id gen-id :dek (dek-by-id store kek gen-id)})))
  (dek-by-id [_ kek generation-id]
    (cached-dek id kek generation-id
                (fn []
                  (let [wrapped (get @rows generation-id)]
                    (when-not wrapped
                      (throw (ex-info "No such DEK generation" {:generation-id generation-id})))
                    (unwrap-dek kek wrapped)))))
  (mint-generation! [_ kek]
    (let [gen-id (new-generation-id @rows)
          dek    (random-dek)]
      (swap! rows assoc gen-id (wrap-dek kek dek))
      (cache-put! id kek gen-id dek)
      {:generation-id gen-id :dek dek}))
  (rewrap-all! [_ old-kek new-kek]
    (let [current @rows]
      (reset! rows (into {} (for [[gen-id wrapped] current]
                              [gen-id (wrap-dek new-kek (unwrap-dek old-kek wrapped))])))
      (count current)))
  (generation-ids [_]
    (vec (sort (keys @rows)))))

(defn in-memory-store
  "A fresh in-memory [[DEKStore]] for tests. Optionally seed it with `{generation-id wrapped-bytes}`."
  ([] (in-memory-store {}))
  ([initial-rows]
   (->InMemoryDEKStore (Object.) (atom initial-rows))))

;;; ------------------------------------------------ active store ------------------------------------------------
;;;
;;; The encryption utilities obtain the active [[DEKStore]] via [[store]], which resolves it in two layers:
;;;
;;;   1. `*store*` -- an explicit override: a store (tests bind an [[in-memory-store]] so v2 writes/reads are DB-free;
;;;      the encryption commands bind the app-DB store for their operation scope), or [[none]] to force "no store".
;;;   2. `*store-resolver*` -- a resolver fn installed once by the app-DB layer. It *derives* whether the current
;;;      application database is encrypted from the database itself (its encryption-check sentinel) and returns a
;;;      store bound to it, or nil when the DB is not encrypted. Because it resolves per-call against the current app
;;;      DB (rather than caching a single global store or registering activation in process state), swapping the app
;;;      DB -- as `dump-to-h2`, `load-from-h2`, and multi-DB tests do -- automatically yields the right store with no
;;;      stale global state.
;;;
;;; When neither yields a store, none is available: writes fall back to the legacy KEK-direct format and v2 reads are
;;; impossible (and none should exist yet).

(def ^:dynamic *store*
  "An explicit [[DEKStore]] override for the encryption utilities. When nil, [[store]] falls back to
  [[*store-resolver*]]. Bind to a store to force its use, or to [[none]] to force \"no store\" even when the resolver
  would supply one."
  nil)

(def none
  "Sentinel for [[*store*]] meaning \"explicitly no store\". Binding `*store*` to this forces legacy-format writes (and
  disables v2 reads) even when the installed resolver would supply a store. For walks that must stay uniformly legacy
  while the DB's own encrypted-state marker is flipping under them: the initial legacy encryption of a fresh DB writes
  the encryption-check sentinel mid-transaction, and without the explicit \"no store\" the resolver would begin
  handing out a store part-way through the walk, mixing formats and minting stray DEKs."
  ::none)

(defonce ^:private store-resolver (atom nil))

(defn set-store-resolver!
  "Install (or clear, with nil) the resolver fn the app-DB layer uses to provide a [[DEKStore]] bound to the current
  application database. The resolver takes no args and returns a store or nil. Idempotent."
  [resolver-fn]
  (reset! store-resolver resolver-fn))

(defn store
  "The currently active [[DEKStore]], or nil. Prefers the explicit [[*store*]] override (where [[none]] forces nil),
  otherwise asks the installed resolver (see [[set-store-resolver!]]) for a store bound to the current application
  database."
  []
  (let [s *store*]
    (cond
      (= s none) nil
      (some? s)  s
      :else      (when-let [resolve-fn @store-resolver]
                   (resolve-fn)))))

(defn store-initialized?
  "Whether a DEK store is available for v2 writes."
  []
  (some? (store)))

(defn generation-exists?
  "Whether `generation-id` is a known generation in `store`. Used to guard the rotation/deep 'already-final?' skip: a
  value that carries the v2 magic but names a generation the store does not have is not really a final v2 value (it is
  most likely a legacy value whose random bytes happened to start with the v2 magic), so it must not be skipped."
  [store generation-id]
  (boolean (and store (some #{generation-id} (generation-ids store)))))

(defn log-generations
  "Log the DEK generations known to `store` (for startup / rotation logging)."
  [store]
  (when store
    (log/infof "DEK generations present: %s" (pr-str (generation-ids store)))))
