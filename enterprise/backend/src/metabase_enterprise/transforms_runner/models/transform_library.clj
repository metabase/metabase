(ns metabase-enterprise.transforms-runner.models.transform-library
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformLibrary [_model] :transform_library)

(doseq [trait [:metabase/model :hook/timestamped? :hook/entity-id]]
  (derive :model/TransformLibrary trait))

(def ^:private language-extensions
  {"python" ".py"
   "javascript" ".js"
   "clojure" ".clj"})

(defn- normalize-path
  [language path]
  (let [ext (get language-extensions language)]
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

(def builtin-entity-ids
  "Map of language name to the stable entity-id for its built-in common library."
  {"python" "cWWH9qJPvHNB3rP2vLZrK"
   "javascript" "aHWo_0yPLwKqpQPlFNzCg"})

(defn- validate-path!
  [language path]
  (let [ext (get language-extensions language)
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
