(ns metabase.secrets.models.secret
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.memoize :as memoize]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/Secret [_model] :secret)

(doto :model/Secret
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/Secret
  {:value  mi/transform-secret-value
   :kind   mi/transform-keyword
   :source mi/transform-keyword})

(methodical/defmethod mi/to-json :model/Secret
  "Never include the secret value in JSON."
  [secret json-generator]
  (next-method
   (dissoc secret :value)
   json-generator))

(defn latest-for-id
  "Returns the latest Secret instance for the given `id` (meaning the one with the highest `version`)."
  {:added "0.42.0"}
  [id]
  (t2/select-one :model/Secret :id id {:order-by [[:version :desc]]}))

(defn upsert-secret-value!
  "Inserts a new secret value, or updates an existing one, for the given parameters.
   * if there is no existing Secret instance, inserts with the given field values
   * if there is an existing latest Secret instance, then inserts a new version with the given parameters."
  {:added "0.42.0"}
  [existing-id nm kind src value]
  (let [insert-new     (fn [id v]
                         (let [inserted (first (t2/insert-returning-instances! :model/Secret (cond-> {:version    v
                                                                                                      :name       nm
                                                                                                      :kind       kind
                                                                                                      :source     src
                                                                                                      :value      value
                                                                                                      :creator_id api/*current-user-id*}
                                                                                               id
                                                                                               (assoc :id id))))]
                           ;; Toucan doesn't support composite primary keys, so adding a new record with incremented
                           ;; version for an existing ID won't return a result from t2/insert!, hence we may need to
                           ;; manually select it here
                           (t2/select-one :model/Secret :id (or id (u/the-id inserted)) :version v)))
        latest-version (when existing-id (latest-for-id existing-id))]
    (if latest-version
      (insert-new (u/the-id latest-version) (inc (:version latest-version)))
      (insert-new nil 1))))

;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

(defn- ->possible-secret-property-names
  "Return a map of secret subproperties for the property `connection-property-name`."
  [connection-property-name]
  ;; created-at :creator-id :source :kind are legacy keys
  (let [sub-prop-types [:path :value :options :created-at :creator-id :source :kind]
        sub-prop #(keyword (str connection-property-name "-" (name %)))]
    (zipmap sub-prop-types (map sub-prop sub-prop-types))))

(defn- ->id-kw [conn-prop-nm]
  (keyword (str conn-prop-nm "-id")))

(def uploaded-base-64-prefix-pattern
  "Regex for parsing base64 encoded file uploads."
  #"^data:application/([^;]*);base64,")

(def ^:const protected-password
  "The string to replace passwords with when serializing Databases."
  "**MetabasePass**")

(defn secret-conn-props-by-name
  "For the driver return a map of all `:type` `:secret` properties, keyed by property name.
  Handles both top-level and grouped (nested) connection properties."
  [driver]
  (let [conn-props-fn (get-method driver/connection-properties driver)]
    (when (fn? conn-props-fn)
      (->> (conn-props-fn driver)
           driver.u/collect-all-props-by-name
           (filter (fn [[_name prop]] (= :secret (keyword (:type prop)))))
           (into {})
           not-empty))))

(defn- reduce-over-details-secret-values
  "Reduces over the given `db-details` (a Database details map), for any secret type connection properties under the
  given `driver`, using the given `reduce-fn`, and returns the accumulated result.

  `reduce-fn` is the reduction fn (i.e. the first arg to [[clojure.core/reduce-kv]]), and is therefore expected to have
  a 3-arity.  Its first param is the accumulated `db-details`, its 2nd param (a String) is the connection property
  name, and the 3rd param (a map) is the connection property map itself (containing the `:name`, `:type`, etc.).  This
  function will only be invoked with connection properties that are of the secret type.

  In essence, this is a utility function to provide a generic mechanism for transforming db-details containing secret
  values."
  {:added "0.42.0"}
  [driver db-details reduce-fn]
  (if (map? db-details)
    (reduce-kv reduce-fn db-details (secret-conn-props-by-name driver))
    db-details))

(defn- bytes-without-uri-encoding
  [value conn-prop]
  (let [is-bytes? (bytes? value)
        is-string? (string? value)
        treatment (get conn-prop :treatment "base64")
        str-value (cond
                    is-bytes? (u/bytes-to-string value)
                    is-string? value)]
    (cond
      (and str-value
           (= "base64" treatment)
           (re-find uploaded-base-64-prefix-pattern str-value))
      (-> str-value
          (str/replace-first uploaded-base-64-prefix-pattern "")
          u/decode-base64-to-bytes)

      is-string?
      (u/string-to-bytes value)

      :else
      value)))

(defn- secret-map-from-details
  "Returns a canonical secret-map containing `:source` and `:value` based solely on `:details`
   When `:details` comes from the client, it may contain updated values for a secret.
   If these properties are not present, return nil.

   This is the case:
   - before database insert and update
   - during connection testing.

   The `-value` property may be base64 encoded and should be decoded.
   `:value` is type `bytes` or nil

   The `-options` property may, or may not be present. If not `-value` should be used."
  [details conn-prop]
  (let [kws (->possible-secret-property-names (:name conn-prop))
        value (when-let [^String value (get details (:value kws))]
                (bytes-without-uri-encoding value conn-prop))
        has-value? (contains? details (:value kws))
        has-path? (contains? details (:path kws))
        options (get details (:options kws))
        path (get details (:path kws))
        path-map (when has-path?
                   {:source :file-path :value path})
        value-map (when has-value?
                    {:source :uploaded :value value})
        secret-map (case (keyword options)
                     :local
                     path-map

                     :uploaded
                     value-map

                     ;; fallback
                     (cond
                       has-value? value-map
                       has-path? path-map))]
    (when (and path (premium-features/is-hosted?))
      (throw (ex-info
              (tru "{0} (a local file path) cannot be used in Metabase hosted environment" (:path kws))
              {:invalid-db-details-entry (select-keys details [(:path kws)])})))

    (when (and secret-map
               ;; If the client sent us back protected-password then it should be ignored and value loaded from Secret.
               (not= (seq (:value secret-map))
                     (seq (codecs/to-bytes protected-password))))
      (update secret-map :value #(some-> % codecs/to-bytes)))))

(defn- resolve-secret-map
  "Returns a canonical map containing `:value` and `:source` for the given `secret-property`.
   May also include `:id` if the value is coming from a persisted Secret.

   If `:details` contains expanded secrets from the client (i.e. during connection testing) it will be preferred.
   If a `-id` property exists, that will be used to lookup the Secret.
   Otherwise return nil."
  [driver details secret-property]
  (let [conn-prop (get (secret-conn-props-by-name driver) secret-property)
        detail-map (secret-map-from-details details conn-prop)
        secret-id (get details (->id-kw secret-property))
        result (cond
                 detail-map detail-map
                 secret-id (latest-for-id secret-id))
        result-source (:source result)]
    (when (:value result)
      (cond-> result
        ;; Fix legacy double encoding stored in secret
        secret-id (update :value bytes-without-uri-encoding conn-prop)
        ;; Normalizes legacy
        (not result-source) (assoc :source :uploaded)))))

(defn- unresolved-value-string
  "Reads the secret-value, which is probably bytes into a string.

   Private because getting the file-path is an implementation detail of Secret."
  [secret-value]
  (cond (string? secret-value)
        secret-value
        (bytes? secret-value)
        (u/bytes-to-string secret-value)))

;;; ---------------------------------------------- Fetching secrets ----------------------------------------------

(defn value-as-string
  "Retrieves a secret as a string.
   If the secret source is `:file-path` then read the file and return the contents.
   Otherwise return the secret value."
  [driver details secret-property]
  (when-let [{source :source secret-value :value} (resolve-secret-map driver details secret-property)]
    (let [s (unresolved-value-string secret-value)]
      (if (= :file-path source)
        (slurp s)
        s))))

(defn- value-as-file*
  [driver details secret-property & [ext]]
  (when-let [{source :source secret-value :value secret-id :id} (resolve-secret-map driver details secret-property)]
    (if (= :file-path source)
      (let [secret-value (unresolved-value-string secret-value)
            ^File existing-file (File. ^String secret-value)]
        (if (.exists existing-file)
          existing-file
          (let [file-path (if secret-id protected-password secret-value)
                error-source (let [secret-props (secret-conn-props-by-name driver)]
                               (tru "File path for {0}" (-> (get secret-props secret-property)
                                                            :display-name)))]
            (throw (ex-info (tru "{0} points to non-existent file: {1}" error-source file-path)
                            {:file-path file-path
                             :secret secret-id})))))
      (let [^File tmp-file (doto (File/createTempFile "metabase-secret_" ext)
                             ;; make the file only readable by owner
                             (.setReadable false false)
                             (.setReadable true true)
                             (.deleteOnExit))]
        (log/tracef "Creating temp file for secret %s value at %s" (or secret-id "") (.getAbsolutePath tmp-file))
        (with-open [out (io/output-stream tmp-file)]
          (let [^bytes v (codecs/to-bytes secret-value)]
            (.write out v)))
        tmp-file))))

(def
  ^java.io.File
  ^{:arglists '([driver details secret-property & [ext]])}
  value-as-file!
  "Returns the value of the given `secret` instance in the form of a file. If the given instance has a `:file-path` as
  its source, a `File` referring to that is returned. Otherwise, the `:value` is written to a temporary file, which is
  then returned.

  `ext?` is an optional argument that sets the file extension used for the temporary file, if one needs to be created."
  (memoize/memo value-as-file*))

;;; ---------------------------------------------- Database Details ----------------------------------------------

(defn delete-orphaned-secrets!
  "Delete Secret instances from the app DB, that will become orphaned when `database` is deleted. For now, this will
  simply delete any Secret whose ID appears in the details blob, since every Secret instance that is currently created
  is exclusively associated with a single Database.

  In the future, if/when we allow arbitrary association of secret instances to database instances, this will need to
  change and become more complicated (likely by consulting a many-to-many join table)."
  [{:keys [id details] :as database}]
  (when-let [possible-secret-prop-names (seq (keys (secret-conn-props-by-name (driver.u/database->driver database))))]
    (doseq [secret-id (reduce (fn [acc prop-name]
                                (if-let [secret-id (get details (->id-kw prop-name))]
                                  (conj acc secret-id)
                                  acc))
                              []
                              possible-secret-prop-names)]
      (log/infof "Deleting secret ID %s from app DB because the owning database (%s) is being deleted" secret-id id)
      (t2/delete! :model/Secret :id secret-id))))

(defn- hydrate-redacted-secret
  [db-details conn-prop-nm _conn-prop]
  (let [kws (->possible-secret-property-names conn-prop-nm)
        secret-id (get db-details (->id-kw conn-prop-nm))]
    ;; If db-details contains secret properties, we must be in a PUT and we want to return to client as is.
    ;; This is true because otherwise [[handle-incoming-client-secrets!]] and
    ;; [[clean-secret-properties-from-database]] would have removed them.
    (cond
      (not-empty (select-keys db-details (vals kws)))
      db-details

      ;; Otherwise we want to return options and path from the Secret but redacted value
      secret-id
      (let [{:keys [source] :as secret} (latest-for-id secret-id)]
        (cond-> db-details
          (= source :file-path)
          (->
           (assoc (:path kws) (unresolved-value-string (:value secret))
                  (:options kws) "local"))

          (not= source :file-path)
          (->
           (assoc (:value kws) protected-password
                  (:options kws) "uploaded"))))

      :else
      db-details)))

(defn to-json-hydrate-redacted-secrets
  "To satisfy clients we need to return the keys they send us in details.
   This is a transformation on `:model/Database` `to-json`

   Fetches the stored secret and fills in `-path` `-options` `-value` for each secret property"
  [database]
  (let [driver (driver.u/database->driver database)]
    (m/update-existing
     database
     :details
     (fn [details]
       (reduce-over-details-secret-values
        driver
        details
        hydrate-redacted-secret)))))

(defn clean-secret-properties-from-details
  "Ensures that all possible secret property values are removed from `:details`.

   This can be used to cleanup `details` in connection properties which should always use
   secret getters above."
  [details driver]
  (reduce-over-details-secret-values
   driver
   details
   (fn [db-details conn-prop-nm _conn-prop]
     (apply dissoc db-details (vals (->possible-secret-property-names conn-prop-nm))))))

(defn clean-secret-properties-from-database
  "Ensures that all possible secret property values are removed from `:details`.
   This is a transformation on `:model/Database` `results-transform`."
  [database]
  (m/update-existing
   database
   :details
   #(clean-secret-properties-from-details
     %
     (driver.u/database->driver database))))

(defn handle-incoming-client-secrets!
  "Converts incoming secret values in `:details` into Secrets.
   This is a transformation on `:model/Database` `before-insert` and `before-update`.

   Only the Secret id should be stored in `:details`. All other secret props should be cleared.

   A secret prop like `{:type :secret, :secret-kind :pem-cert :name :private-key}` can get expanded by
   [[driver.u/connection-props-server->client]] into these connection properties:

   ```
   [:private-key-value ;; IMPORTANT if `is-hosted?` this is the only prop that will be present.
    :private-key-options
    :private-key-path]
   ```

   In this case, we want to look for a `:private-key-id` in the `original-details` which would indicate
   that we have stored a Secret before. We upsert the secret-value (which could be `-path` or `-value`).
   We clear out all the possible secret-keys `-value`, `-options`, `-path` and store the `-id`."
  [{:keys [details] :as database}]
  (let [{original-details :details} (t2/original database)
        updated-details (reduce-over-details-secret-values
                         (driver.u/database->driver database)
                         details
                         (fn [db-details conn-prop-nm conn-prop]
                           (let [kws (->possible-secret-property-names conn-prop-nm)
                                 id-kw (keyword (str conn-prop-nm "-id"))
                                 secret-id (get original-details id-kw)
                                 secret (secret-map-from-details db-details conn-prop)
                                 cleared-details (apply dissoc db-details (vals kws))]
                             (if secret
                               (if (:value secret)
                                 (let [{:keys [id]} (upsert-secret-value!
                                                     secret-id
                                                     (format "%s for %s" (:display-name conn-prop) (:name database))
                                                     (:secret-kind conn-prop)
                                                     (:source secret)
                                                     (:value secret))]
                                   (assoc cleared-details id-kw id))
                                 (do
                                   (t2/delete! :model/Secret :id secret-id)
                                   (dissoc cleared-details id-kw)))
                                ;; Don't throw out a secret even if the client didn't sent it back
                               (m/assoc-some cleared-details id-kw secret-id)))))]
    (assoc database :details updated-details)))
