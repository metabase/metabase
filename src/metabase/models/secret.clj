(ns metabase.models.secret
  (:require [cheshire.generate :refer [add-encoder encode-map]]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [metabase.api.common :as api]
            [metabase.models.interface :as i]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]
            [toucan.models :as models])
  (:import java.io.File
           java.nio.charset.StandardCharsets))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Secret :secret)

(u/strict-extend (class Secret)
  models/IModel
  (merge models/IModelDefaults
         {;:hydration-keys (constantly [:database :db]) ; don't think there's any hydration going on since other models
                                                        ; won't have a direct secret-id column
          :types          (constantly {:value  :secret-value
                                       :kind   :keyword
                                       :source :keyword})
          :properties     (constantly {:timestamped? true})})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?         i/superuser?
          :can-write?        i/superuser?}))

;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------

(defn value->string
  "Returns the value of the given `secret` as a String.  `secret` can be a Secret model object, or a
  secret-map (i.e. return value from `db-details-prop->secret-map`)."
  {:added "0.42.0"}
  ^String [{:keys [value] :as secret}]
  (cond (string? value)
        value
        (bytes? value)
        (String. ^bytes value StandardCharsets/UTF_8)))

(defn value->file!
  "Returns the value of the given `secret` in the form of a file.  `secret` can be a Secret model object, or a
  secret-map (i.e. return value from `db-details-prop->secret-map`).

  In any case, if the `:source` is `:file-path`, then the value will be returned unchanged (since it is ostensibly
  already a file).  Otherwise, a temp file will be created and the secret value will be written to it, and the path to
  that temp file will be returned."
  {:added "0.42.0"}
  [{:keys [id ^bytes value] :as secret}]
  (if (= :file-path (:source secret))
    (let [secret-val          (value->string secret)
          ^File existing-file (File. secret-val)]
      (if (.exists existing-file)
        existing-file
        (throw (ex-info (tru "Secret {0} points to non-existent file: {1}" (or id "") secret-val)
                 {:secret-id id
                  :file-path secret-val}))))
    (let [^File tmp-file (doto (File/createTempFile "metabase-secret_" nil)
                           ;; make the file only readable by owner
                           (.setReadable false false)
                           (.setReadable true true)
                           (.deleteOnExit))]
      (log/tracef "Creating temp file for secret %s value at %s" (or id "") (.getAbsolutePath tmp-file))
      (with-open [out (io/output-stream tmp-file)]
        (.write out value))
      tmp-file)))

(def
  ^{:doc "The attributes of a secret which, if changed, will result in a version bump" :private true}
  bump-version-keys
  [:kind :source :value])

(defn latest-for-id
  "Returns the latest Secret instance for the given `id` (meaning the one with the highest `version`)."
  {:added "0.42.0"}
  [id]
  (db/select-one Secret :id id {:order-by [[:version :desc]]}))

(defn upsert-secret-value!
  "Inserts a new secret value, or updates an existing one, for the given parameters.
   * if there is no existing Secret instance, inserts with the given field values
   * if there is an existing latest Secret instance, and the value (or any of the supporting fields, like kind or
       source) has changed, then inserts a new version with the given parameters.
   * if there is an existing latest Secret instance, but none of the aforementioned fields changed, then update it"
  {:added "0.42.0"}
  [existing-id nm kind source value]
  (let [insert-new     (fn [id v]
                         (let [inserted (db/insert! Secret (cond-> {:version    v
                                                                    :name       nm
                                                                    :kind       kind
                                                                    :source     source
                                                                    :value      value
                                                                    :creator_id api/*current-user-id*}
                                                             id
                                                             (assoc :id id)))]
                           ;; Toucan doesn't support composite primary keys, so adding a new record with incremented
                           ;; version for an existing ID won't return a result from db/insert!, hence we may need to
                           ;; manually select it here
                           (or inserted (db/select-one Secret :id id :version v))))
        latest-version (when existing-id (latest-for-id existing-id))]
    (if latest-version
      (if (= (select-keys latest-version bump-version-keys) [kind source value])
        (db/update-where! Secret {:id existing-id :version (:version latest-version)}
                                 :name nm)
        (insert-new (u/the-id latest-version) (inc (:version latest-version))))
      (insert-new nil 1))))

(defn db-details-prop->secret-map
  "Returns a map containing `:value` and `:source` for the given `conn-prop-nm`. `conn-prop-nm` is expected to be the
  name of a connection property having `:type` `:secret`, and the relevant sub-properties (ex: -value, -path, etc.) will
  be resolved in order to calculate the returned map.

  This returned map represents a partial Secret model instance
  (having some of the required properties set), but also represents a discrete property that can be used in connection
  testing (even without the Secret needing to be persisted)."
  {:added "0.42.0"}
  [details conn-prop-nm]
  (let [sub-prop  (fn [suffix]
                    (keyword (str conn-prop-nm suffix)))
        path-kw   (sub-prop "-path")
        value-kw  (sub-prop "-value")
        id-kw     (sub-prop "-id")
        value     (if-let [v (value-kw details)]     ; the -value suffix was specified; use that
                    v
                    (if-let [path (path-kw details)] ; the -path suffix was specified; this is actually a :file-path
                      (do
                        (when (premium-features/is-hosted?)
                          (throw (ex-info
                                   (tru "{0} (a local file path) cannot be used in Metabase hosted environment" path-kw)
                                   {:invalid-db-details-entry (select-keys details [path-kw])})))
                        path)
                      (when-let [id (id-kw details)]
                        (:value (Secret id)))))
        source    (cond
                    (path-kw details) ; set the :source due to the -path suffix (see above))
                    :file-path

                    (id-kw details)
                    (:source (Secret (id-kw details))))]
    {:value value :source source}))

;;; -------------------------------------------------- JSON Encoder --------------------------------------------------

(add-encoder SecretInstance (fn [secret json-generator]
                              (encode-map
                               (dissoc secret :value) ; never include the secret value in JSON
                               json-generator)))
