(ns metabase.encryption.spec
  "Declarative spec for all encrypted columns in the app DB.

   This is the single source of truth for:
   1. Which columns are encrypted and how (toucan2 transform registration)
   2. Conditional encryption logic (toucan2 lifecycle hooks)
   3. Encryption key rotation (used by [[metabase.encryption.rotation]])

  If you want to add an encrypted column to a model, or encrypt columns for *some* rows of a model, then
  register the model/column in the spec.

  All registered encrypted columns will automatically be included in key rotation."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.memoize :as memoize]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.encryption.impl :as encryption.impl]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [toucan2.core :as t2]
   [toucan2.tools.transformed :as t2.transformed]))

(defn- encode-then-encrypt [encrypt v]
  (encrypt (json/encode v)))

;; cache decrypted JSON for one hour — decryption + JSON parsing is ~500µs which adds up for hot paths
(def ^:private cached-decrypt-then-decode
  (memoize/ttl
   (fn [decrypt v]
     (let [decrypted (decrypt v)]
       (try
         (json/decode+kw decrypted)
         ;; TODO: IMO it would be a LOT SAFER to just fail fast in this case. This way someone can more-or-less
         ;; immediately detect that they have data in their database that's encrypted with an old token. This matches
         ;; the old behavior, though: fall back to the raw value, as `mi/encrypted-json-out` did. Callers that need
         ;; fail-closed semantics (e.g. MFA credentials) rely on downstream processing rejecting the raw string.
         (catch Exception e
           (if (encryption.impl/possibly-encrypted-string? decrypted)
             (log/error e "Could not decrypt encrypted field! Have you forgot to set MB_ENCRYPTION_SECRET_KEY?")
             (log/error e "Error parsing JSON"))
           v))))
   :ttl/threshold (* 60 60 1000)))

(defn- decrypt-then-decode [decrypt v]
  (cached-decrypt-then-decode decrypt v))

(defn clear-cache!
  "Clear the decryption cache. Called by test helpers when the encryption key changes."
  []
  (memoize/memo-clear! cached-decrypt-then-decode))

(defn- just-apply [f value]
  (f value))

(defn- parse-credentials-timestamps
  "Parse timestamp strings in AuthIdentity credentials to java.time.Instant when reading from the database."
  [credentials]
  (into {}
        (map (fn [[key value]]
               (cond-> [key value]
                 (and (contains? #{:expires_at :consumed_at :grant_ends_at} key)
                      (string? value))
                 (update 1 t/instant))))
        credentials))

(def encryption-spec-oss
  "The encryption spec for OSS models."
  {:model/Database     {:details            {:in  encode-then-encrypt
                                             :out decrypt-then-decode
                                             :type :string}
                        :settings           {:in  encode-then-encrypt
                                             :out decrypt-then-decode
                                             :type :string}
                        :write_data_details {:in  encode-then-encrypt
                                             :out decrypt-then-decode
                                             :type :string}
                        :admin_details      {:in  encode-then-encrypt
                                             :out decrypt-then-decode
                                             :type :string}}
   :model/User         {:settings {:in  encode-then-encrypt
                                   :out decrypt-then-decode
                                   :type :string}}
   :model/Channel      {:details  {:in  encode-then-encrypt
                                   :out decrypt-then-decode
                                   :type :string}}
   ;; `credentials` is encrypted at rest (whole column) so secrets stored in it — e.g. the TOTP
   ;; shared secret — survive key rotation, which re-encrypts whole columns and cannot reach fields
   ;; nested inside JSON. Rows written before encryption was introduced are plaintext JSON;
   ;; `maybe-decrypt` passes them through unchanged.
   :model/AuthIdentity {:credentials {:in  encode-then-encrypt
                                      :out (fn [decrypt v]
                                             (parse-credentials-timestamps (decrypt-then-decode decrypt v)))
                                      :type :string}}
   :model/Setting      {:value {:encrypt-if? setting/should-encrypt?
                                :type :string}}
   :model/Secret       {:value {:in  (fn [encrypt v] (encrypt (codecs/to-bytes v)))
                                :out (fn [decrypt v] (decrypt (mi/maybe-blob->bytes v)))
                                :type :bytes}}})

(def encryption-spec-ee
  "The encryption spec for EE-only models"
  {:model/WorkspaceDatabase {:database_details {:in  encode-then-encrypt
                                                :out decrypt-then-decode
                                                :type :string}}})

(def encryption-spec
  "Declarative spec of all encrypted columns in the app DB.

   Each model maps to its encrypted columns. Each column entry has:

   - `:in`          takes 2 args, `encrypt` (encryption function) and `value`. Should call `encrypt` on
                    the value after doing any necessary setup, e.g. JSON encoding
                    Default: just encrypt the value

   - `:out`         takes 2 args, `decrypt` (decryption function) and `value`. Should call `decrypt` on
                    the value, pre- or post-processing the value as necessary.
                    Default: just decrypt the value

   - `:encrypt-if?` (optional) fn taking the full row, returns truthy if this row should
                    be encrypted.

   - `:type`        `:string` or `:bytes`. Determines which encrypt fn is used (`maybe-encrypt-bytes` vs `maybe-encrypt`)."
  (merge encryption-spec-oss (when config/ee-available? encryption-spec-ee)))

;;; ------------------------------------------------ Transform registration ------------------------------------------------

;; For models where all rows are encrypted uniformly, register toucan2 transforms via `derive`.
;; We use one keyword per model (not per column) to avoid ambiguity errors when a model has
;; multiple encrypted columns.

(doseq [[model columns] encryption-spec
        :let [transform-cols (into {}
                                   (keep (fn [[column {:keys [in out encrypt-if? type]}]]
                                           (when-not encrypt-if?
                                             (let [encrypt-fn (if (= type :bytes)
                                                                encryption.impl/maybe-encrypt-bytes
                                                                encryption.impl/maybe-encrypt)
                                                   decrypt-fn encryption.impl/maybe-decrypt
                                                   in-fn      (or in just-apply)
                                                   out-fn     (or out just-apply)]
                                               [column {:in  (partial in-fn encrypt-fn)
                                                        :out  (partial out-fn decrypt-fn)}]))))
                                   columns)]
        :when (seq transform-cols)]
  (let [kw (keyword "metabase.encryption.spec" (name model))]
    (m/defmethod t2.transformed/transforms kw [_model]
      transform-cols)
    (derive model kw)))

;;; ------------------------------------------------ Lifecycle hooks ------------------------------------------------

;; For models where encryption is conditional per-row (e.g. Setting), register lifecycle hooks
;; on a parent keyword. Toucan2's `next-method` chaining gives correct ordering:
;; - before-insert/before-update: child body runs first -> spec encrypts
;; - after-select: spec decrypts first -> child body runs

(doseq [[model columns] encryption-spec
        :let [conditional-cols (into {} (filter (fn [[_ v]] (:encrypt-if? v))) columns)]
        :when (seq conditional-cols)]
  (let [hook-kw (keyword "metabase.encryption.spec"
                         (str (name model) ".hooks"))
        encrypt-conditional-columns (fn [row]
                                      (reduce-kv (fn [r column {:keys [in encrypt-if? type]}]
                                                   (let [encrypt-fn (if (= type :bytes) encryption.impl/maybe-encrypt-bytes encryption.impl/maybe-encrypt)
                                                         in-fn      (or in just-apply)]
                                                     (cond-> r
                                                       (and (some? (get r column)) (encrypt-if? r))
                                                       (update column (partial in-fn encrypt-fn)))))
                                                 row conditional-cols))]
    (t2/define-before-insert hook-kw [row]
      (encrypt-conditional-columns row))
    (t2/define-before-update hook-kw [row]
      (encrypt-conditional-columns row))
    (t2/define-after-select hook-kw [row]
      (reduce-kv (fn [r column {:keys [out encrypt-if?]}]
                   (let [decrypt-fn encryption.impl/maybe-decrypt
                         out-fn     (or out just-apply)]
                     (cond-> r
                       (and (some? (get r column)) (encrypt-if? r))
                       (update column (partial out-fn decrypt-fn)))))
                 row conditional-cols))
    (derive model hook-kw)))
