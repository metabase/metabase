(ns metabase.models.secret
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def Secret
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/Secret)

(methodical/defmethod t2/table-name :model/Secret [_model] :secret)

(doto Secret
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/Secret
  {:value  mi/transform-secret-value
   :kind   mi/transform-keyword
   :source mi/transform-keyword})

;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

(defn value->string
  "Returns the value of the given `secret` as a String.  `secret` can be a Secret model object, or a
  secret-map (i.e. return value from `db-details-prop->secret-map`)."
  {:added "0.42.0"}
  ^String [{:keys [value] :as _secret}]
  (cond (string? value)
        value
        (bytes? value)
        (String. ^bytes value StandardCharsets/UTF_8)))

(defn conn-props->secret-props-by-name
  "For the given `conn-props` (output of `driver/connection-properties`), return a map of all `:type` `:secret`
  properties, keyed by property name."
  {:added "0.42.0"}
  [conn-props]
  (->> (filter #(= :secret (keyword (:type %))) conn-props)
    (reduce (fn [acc prop] (assoc acc (:name prop) prop)) {})))

(defn value->file!*
  "Returns the value of the given `secret` instance in the form of a file. If the given instance has a `:file-path` as
  its source, a `File` referring to that is returned. Otherwise, the `:value` is written to a temporary file, which is
  then returned.

  `driver?` is an optional argument that is only used if an ostensibly existing file value (i.e. `:file-path`) can't be
  resolved, in order to render a more user-friendly error message (by looking up the display names of the connection
  properties involved).

  `ext?` is an optional argument that sets the file extension used for the temporary file, if one needs to be created."
  {:added "0.42.0"}
  (^File [secret]
   (value->file!* secret nil))
  (^File [secret driver?]
   (value->file!* secret driver? nil))
  (^File [{:keys [connection-property-name id value] :as secret} driver? ext?]
   (if (= :file-path (:source secret))
     (let [secret-val          (value->string secret)
           ^File existing-file (File. secret-val)]
       (if (.exists existing-file)
         existing-file
         (let [error-source (cond
                              id
                              (tru "Secret ID {0}" id)

                              (and connection-property-name driver?)
                              (let [secret-props (-> (driver/connection-properties driver?)
                                                     conn-props->secret-props-by-name)]
                                (tru "File path for {0}" (-> (get secret-props connection-property-name)
                                                             :display-name)))

                              :else
                              (tru "Path"))]
           (throw (ex-info (tru "{0} points to non-existent file: {1}" error-source secret-val)
                           {:file-path secret-val
                            :secret    secret})))))
     (let [^File tmp-file (doto (File/createTempFile "metabase-secret_" ext?)
                            ;; make the file only readable by owner
                            (.setReadable false false)
                            (.setReadable true true)
                            (.deleteOnExit))]
       (log/tracef "Creating temp file for secret %s value at %s" (or id "") (.getAbsolutePath tmp-file))
       (with-open [out (io/output-stream tmp-file)]
         (let [^bytes v (cond
                          (string? value)
                          (.getBytes ^String value "UTF-8")

                          (bytes? value)
                          ^bytes value)]
           (.write out v)))
       tmp-file))))

(def
  ^java.io.File
  ^{:arglists '([{:keys [connection-property-name id value] :as secret} & [driver? ext?]])}
  value->file!
  "Returns the value of the given `secret` instance in the form of a file. If the given instance has a `:file-path` as
  its source, a `File` referring to that is returned. Otherwise, the `:value` is written to a temporary file, which is
  then returned.

  `driver?` is an optional argument that is only used if an ostensibly existing file value (i.e. `:file-path`) can't be
  resolved, in order to render a more user-friendly error message (by looking up the display names of the connection
  properties involved).

  `ext?` is an optional argument that sets the file extension used for the temporary file, if one needs to be created."
  (memoize/memo
   (with-meta value->file!*
     {::memoize/args-fn (fn [[secret _driver? ext?]]
                          ;; not clear if value->string could return nil due to the cond so we'll just cache on a key
                          ;; that is unique
                          [(vec (:value secret)) ext?])})))

(defn get-sub-props
  "Return a map of secret subproperties for the property `connection-property-name`."
  [connection-property-name]
  (let [sub-prop-types [:path :value :options :id]
        sub-prop #(keyword (str connection-property-name "-" (name %)))]
    (zipmap sub-prop-types (map sub-prop sub-prop-types))))

(def uploaded-base-64-prefix-pattern
  "Regex for parsing base64 encoded file uploads."
  #"^data:application/([^;]*);base64,")

(defn latest-for-id
  "Returns the latest Secret instance for the given `id` (meaning the one with the highest `version`)."
  {:added "0.42.0"}
  [id]
  (t2/select-one Secret :id id {:order-by [[:version :desc]]}))

(defn db-details-prop->secret-map
  "Returns a map containing `:value` and `:source` for the given `conn-prop-nm`. `conn-prop-nm` is expected to be the
  name of a connection property having `:type` `:secret`, and the relevant sub-properties (ex: -value, -path, etc.) will
  be resolved in order to calculate the returned map.

  This returned map represents a partial Secret model instance (having some of the required properties set), but also
  represents a discrete property that can be used in connection testing (even without the Secret needing to be
  persisted). In addition to possibly having `:value` and `:source` populated (if the secret value can be resolved), its
  keys will always include:

  `:connection-property-name` - the `conn-prop-nm` that was initially passed in, for use later in error handling.
  `:subprops` - a sequence of subproperties (keywords) that represent all secret related subproperties that might
                exist and be manipulated by the secret handling code (which are used to ensure all these internal and
                intermediate subproperties are removed from the connection-properties before building the JDBC spec)."
  {:added "0.42.0"}
  [details conn-prop-nm]
  (let [{path-kw :path, value-kw :value, options-kw :options, id-kw :id}
        (get-sub-props conn-prop-nm)
        value  (cond
                 ;; ssl-root-certs will need their prefix removed, and to be base 64 decoded (#20319)
                 (and (value-kw details) (#{"ssl-client-cert" "ssl-root-cert"} conn-prop-nm)
                      (re-find uploaded-base-64-prefix-pattern (value-kw details)))
                 (-> (value-kw details) (str/replace-first uploaded-base-64-prefix-pattern "") u/decode-base64)

                 (and (value-kw details) (#{"ssl-key"} conn-prop-nm)
                      (re-find uploaded-base-64-prefix-pattern (value-kw details)))
                 (.decode (java.util.Base64/getDecoder)
                          (str/replace-first (value-kw details) uploaded-base-64-prefix-pattern ""))

                 ;; the -value suffix was specified; use that
                 (value-kw details)
                 (value-kw details)

                 ;; the -path suffix was specified; this is actually a :file-path
                 (path-kw details)
                 (u/prog1 (path-kw details)
                   (when (premium-features/is-hosted?)
                     (throw (ex-info
                             (tru "{0} (a local file path) cannot be used in Metabase hosted environment" path-kw)
                             {:invalid-db-details-entry (select-keys details [path-kw])}))))

                 (id-kw details)
                 (:value (latest-for-id (id-kw details))))
        source (cond
                 ;; set the :source due to the -path suffix (see above))
                 (and (not= "uploaded" (options-kw details)) (path-kw details))
                 :file-path

                 (id-kw details)
                 (:source (latest-for-id (id-kw details))))]
    (cond-> {:connection-property-name conn-prop-nm, :subprops [path-kw value-kw id-kw]}
      value
      (assoc :value value
             :source source))))

(defn get-secret-string
  "Get the value of a secret property from the database details as a string."
  [details secret-property]
  (let [{path-kw :path, value-kw :value, options-kw :options, id-kw :id} (get-sub-props secret-property)
        id (id-kw details)
        ;; When a secret is updated, we get both a new value as well as the ID of old secret.
        value (or (when-let [value (value-kw details)]
                    (if (string? value)
                      value
                      (String. ^bytes value "UTF-8")))
                  (when id
                    (String. ^bytes (:value (latest-for-id id)) "UTF-8")))]
    (case (options-kw details)
      "uploaded" (try
                   ;; When a secret is updated, the value has already been decoded
                   ;; instead of checking if the string is base64 encoded, we just
                   ;; try to decoded it and leave it as is if the attempt fails.
                   (String. ^bytes (driver.u/decode-uploaded value) "UTF-8")
                   (catch IllegalArgumentException _
                     value))
      "local" (slurp (if id value (path-kw details)))
      value)))

(def
  ^{:doc "The attributes of a secret which, if changed, will result in a version bump" :private true}
  bump-version-keys
  [:kind :source :value])

(defn upsert-secret-value!
  "Inserts a new secret value, or updates an existing one, for the given parameters.
   * if there is no existing Secret instance, inserts with the given field values
   * if there is an existing latest Secret instance, and the value (or any of the supporting fields, like kind or
       source) has changed, then inserts a new version with the given parameters.
   * if there is an existing latest Secret instance, but none of the aforementioned fields changed, then update it"
  {:added "0.42.0"}
  [existing-id nm kind src value]
  (let [insert-new     (fn [id v]
                         (let [inserted (first (t2/insert-returning-instances! Secret (cond-> {:version    v
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
                           (t2/select-one Secret :id (or id (u/the-id inserted)) :version v)))
        latest-version (when existing-id (latest-for-id existing-id))]
    (if latest-version
      (if (= (select-keys latest-version bump-version-keys) [kind src value])
        (pos? (t2/update! Secret {:id existing-id :version (:version latest-version)}
                        {:name nm}))
        (insert-new (u/the-id latest-version) (inc (:version latest-version))))
      (insert-new nil 1))))

(defn reduce-over-details-secret-values
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
  (let [conn-props-fn (get-method driver/connection-properties driver)]
    (if (and (map? db-details) (fn? conn-props-fn))
        (let [conn-props            (conn-props-fn driver)
              conn-secrets-by-name  (conn-props->secret-props-by-name conn-props)]
          (reduce-kv reduce-fn db-details conn-secrets-by-name))
        db-details)))

(defn expand-inferred-secret-values
  "Expand certain secret sub-properties in the `db-details`, depending on the secret type, for admin purposes.  This is
  invoked as part of a KV reduction over secret type connection-properties, so `conn-prop-nm` (a String), and
  `conn-prop` (a map containing the connection property definition) are also passed as parameters.

  `secret-or-id?` is an optional param that, if passed, will be used to look up the derived secret values (to avoid a
  redundant app DB query if the caller already has this; if a nil param value is passed, then the secret ID will be
  looked up from the `:db-details` map at `conn-prop-nm`).

  The keys/value pairs that may be added into `db-details`:

   - <prop>-value - the secret value itself, in the case that the secret is a file-path type (as opposed to a value we
                    store directly); the purpose of expanding this is to repopulate the file paths in the UI at the
                    cost of \"exposing\" the file path (which itself shouldn't be too risky, especially since it will
                    only be shown to admins); only populated for file type secret values
   - <prop>-creator-id - the ID of the user who \"created\" the secret value for <prop> (i.e. the last person who
                         updated it), for audit purposes; only populated for non-file type secret values
   - <prop>-created-at - the timestamp of the last time the secret value for <prop> was changed or updated; only
                         populated for non-file type secret values"
  {:added "0.42.0"}
  [db-details conn-prop-nm _conn-prop & [secret-or-id]]
  (let [subprop (fn [prop-nm]
                  (keyword (str conn-prop-nm prop-nm)))
        secret* (cond (int? secret-or-id)
                      (latest-for-id secret-or-id)

                      (mi/instance-of? Secret secret-or-id)
                      secret-or-id

                      :else ; default; app DB look up from the ID in db-details
                      (latest-for-id (get db-details (subprop "-id"))))
        src     (:source secret*)]
    ;; always populate the -source, -creator-id, and -created-at sub properties
    (cond-> (assoc db-details (subprop "-source") src
                              (subprop "-creator-id") (:creator_id secret*))

      (some? (:created_at secret*))
      (assoc (subprop "-created-at") (t/format :iso-offset-date-time (:created_at secret*)))

      (= :file-path src) ; for file path sources only, populate the value
      (assoc (subprop "-value") (value->string secret*)))))

(defn expand-db-details-inferred-secret-values
  "Expand certain inferred secret sub-properties in the `database` `:details`, for the purpose of serving requests by
  users with write permissions for the DB (ex: to edit an existing database or view its current details). This is to
  populate certain values that shouldn't be stored in the details blob itself, but which can be derived from the
  details->secret association itself. Refer to the docstring for [[expand-inferred-secret-values]] for full details."
  {:added "0.42.0"}
  [database]
  (update database :details (fn [details]
                              (reduce-over-details-secret-values (driver.u/database->driver database)
                                                                 details
                                                                 expand-inferred-secret-values))))

(methodical/defmethod mi/to-json Secret
  "Never include the secret value in JSON."
  [secret json-generator]
  (next-method
   (dissoc secret :value)
   json-generator))
