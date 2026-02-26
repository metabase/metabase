(ns metabase-enterprise.transforms-runner.models.transform-library
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.transforms.interface :as transforms.i]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformLibrary [_model] :transform_library)

(doseq [trait [:metabase/model :hook/timestamped? :hook/entity-id]]
  (derive :model/TransformLibrary trait))

(defn- language-extension
  "Return the file extension (e.g. \".py\") for a language string, looked up from lang-config."
  [language]
  (:extension (transforms.i/lang-config (keyword language))))

(defn- normalize-path
  [language path]
  (let [ext (language-extension language)]
    (if (and ext (not (.endsWith ^String path ext)))
      (str path ext)
      path)))

(t2/define-before-insert :model/TransformLibrary
  [library]
  (update library :path (partial normalize-path (:language library))))

(t2/define-before-update :model/TransformLibrary
  [library]
  (if (:path library)
    (update library :path (partial normalize-path (or (:language library)
                                                      (:language (t2/original library)))))
    library))

(defmethod mi/can-read? :model/TransformLibrary
  ([_instance]
   (perms/has-any-transforms-permission? api/*current-user-id*))
  ([_model _pk]
   (perms/has-any-transforms-permission? api/*current-user-id*)))

(defmethod mi/can-write? :model/TransformLibrary
  ([_instance]
   (perms/has-any-transforms-permission? api/*current-user-id*))
  ([_model _pk]
   (perms/has-any-transforms-permission? api/*current-user-id*)))

(def ^:private legacy-entity-ids
  "Stable entity IDs for built-in libraries created by Liquibase migrations.
  New languages get deterministic IDs via [[builtin-entity-id]]."
  {"python" "cWWH9qJPvHNB3rP2vLZrK"
   "javascript" "aHWo_0yPLwKqpQPlFNzCg"})

(defn builtin-entity-id
  "Return the stable entity ID for a language's built-in common library.
  Legacy languages (python, javascript) use migration-baked IDs; new languages
  get a deterministic 21-char NanoID-style hash derived from the language name."
  [language]
  (or (get legacy-entity-ids language)
      (let [bytes (.digest (java.security.MessageDigest/getInstance "SHA-256")
                           (.getBytes (str "transform-library:" language) "UTF-8"))
            encoded (-> (java.util.Base64/getUrlEncoder)
                        (.withoutPadding)
                        (.encodeToString bytes))]
        (subs encoded 0 21))))

(defn all-builtin-entity-ids
  "Return the set of entity IDs for all registered runner languages' built-in libraries."
  []
  (into #{}
        (map (comp builtin-entity-id name))
        (transforms.i/runner-languages)))

(defn- validate-path!
  [language path]
  (let [ext (language-extension language)
        normalized (normalize-path language path)
        allowed-path (str "common" ext)]
    (when-not (= normalized allowed-path)
      (throw (ex-info (tru "Invalid library path. Only ''common'' is currently supported.")
                      {:status-code 400
                       :path normalized
                       :language language
                       :allowed-paths [allowed-path]})))))

(defn get-library-by-path
  "Look up a TransformLibrary record by `language` and `path`, validating the path first."
  [language path]
  (let [normalized (normalize-path language path)]
    (validate-path! language normalized)
    (t2/select-one :model/TransformLibrary :language language :path normalized)))

(defn update-library-source!
  "Create or update the TransformLibrary record for `language` and `path` with the given `source`."
  [language path source]
  (let [normalized (normalize-path language path)]
    (validate-path! language normalized)
    (let [id (app-db/update-or-insert! :model/TransformLibrary
                                       {:language language :path normalized}
                                       (constantly {:language language :path normalized :source source}))]
      (t2/select-one :model/TransformLibrary id))))

(defn ensure-builtin-library!
  "Ensure the built-in common library row exists for `language`.
  Inserts idempotently — no-op if the row already exists.
  Call from init modules so that new runner languages get a library row
  without requiring a Liquibase migration."
  [language]
  (let [ext (language-extension language)
        path (str "common" ext)
        eid (builtin-entity-id language)]
    (when-not (t2/exists? :model/TransformLibrary :language language :path path)
      (t2/insert! :model/TransformLibrary
                  {:path path :source "" :language language :entity_id eid}))))

(defmethod serdes/make-spec "TransformLibrary"
  [_model-name _opts]
  {:copy [:language :path :source :entity_id]
   :transform {:created_at (serdes/date)}})

(defmethod serdes/hash-fields :model/TransformLibrary
  [_model]
  [:language :path])

(defmethod serdes/storage-path "TransformLibrary" [entity _ctx]
  (let [{:keys [id label]} (-> entity serdes/path last)]
    ["transform-libraries" (serdes/storage-leaf-file-name id label)]))

(derive ::event :metabase/event)
(doseq [e [:event/transform-library-create :event/transform-library-update :event/transform-library-delete]]
  (derive e ::event))

(t2/define-after-insert :model/TransformLibrary
  [library]
  (events/publish-event! :event/transform-library-create {:object library})
  library)

(t2/define-after-update :model/TransformLibrary
  [library]
  (events/publish-event! :event/transform-library-update {:object library})
  library)
