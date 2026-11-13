(ns metabase-enterprise.permission-debug.preview-grant
  "Preview grants: a short-lived signed claim that admin A may preview the app as user X from the browser session it
  was issued to. The host page holds it and its broker stamps it on each request it makes for the preview frame as
  `X-Metabase-Preview-Grant`; the frame itself never sees it.

  A grant is an HS256 JSON Web Token with the claims `aid` (the admin), `uid` (the previewed user: a real user, or the
  hidden preview user of a group or tenant), `skb` (a keyed hash of the admin's session-key hash, so the grant works
  only on the session it was issued to, without revealing that hash) and `exp`."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [buddy.core.nonce :as nonce]
   [buddy.sign.jwt :as jwt]
   [metabase.util.log :as log])
  (:import
   (java.security MessageDigest)
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def grant-header
  "The request header the host broker stamps a preview grant on."
  "x-metabase-preview-grant")

(def lifetime-seconds
  "How long a grant stays valid. The host page fetches a new one when a request answers `preview-grant-expired`."
  (* 30 60))

;; TODO (proof of concept): the key lives in this JVM only, so grants don't survive a restart and don't work across
;; instances. Assumes a single instance; a real build would derive it from an instance secret.
(defonce ^:private signing-key (nonce/random-bytes 32))

(defn- session-binding
  [session-key-hash]
  (codecs/bytes->b64-str (mac/hash (str "permission-preview-session." session-key-hash)
                                   {:key signing-key :alg :hmac+sha256})
                         true))

(defn issue
  "A grant for `admin-id` to preview as `user-id` from the session whose `key_hashed` is `session-key-hash`, with its
  expiry in epoch seconds."
  [admin-id user-id session-key-hash]
  (let [expires-at (+ (.getEpochSecond (Instant/now)) lifetime-seconds)]
    {:grant      (jwt/sign {:aid admin-id
                            :uid user-id
                            :skb (session-binding session-key-hash)
                            :exp expires-at}
                           signing-key
                           {:alg :hs256})
     :expires-at expires-at}))

(defn verify
  "`{:admin-id :user-id}` from `grant` when it is signed here, unexpired, and bound to `session-key-hash`; otherwise
  `{:error <code>}`, one of `preview-grant-invalid`, `preview-grant-expired` or `preview-grant-session-mismatch`."
  [grant session-key-hash]
  (try
    (let [{:keys [aid uid skb]} (jwt/unsign grant signing-key {:alg :hs256})]
      (cond
        (not (and (pos-int? aid) (pos-int? uid) (string? skb)))
        {:error "preview-grant-invalid"}

        (not (and session-key-hash
                  (MessageDigest/isEqual (codecs/str->bytes skb)
                                         (codecs/str->bytes (session-binding session-key-hash)))))
        {:error "preview-grant-session-mismatch"}

        :else
        {:admin-id aid :user-id uid}))
    (catch Exception e
      (if (= :exp (:cause (ex-data e)))
        {:error "preview-grant-expired"}
        (do (log/debug e "Refused a preview grant")
            {:error "preview-grant-invalid"})))))
