(ns metabase-enterprise.workspaces.models.workspace
  "Workspaces are a container that an LLM can use to store and manage state. They are the answer to 'How do we allow LLMs to do stuff, in a safe way?'.

  It has locked down permissions and
   is used to store information that the LLM can use to answer questions or perform tasks. It is not a database, but
   rather a way to manage state in a way that is secure and controlled.

  There's also a concept of a workspace having a user and a workspace having a database. The user has limited access to the database so that they can only
   access the data that is relevant to them. The workspace is a way to manage this access and control what the user can do with the data.

  Workspace users are not the same as Metabase users. They do not have a permission group, They are a separate concept
  that is used to manage access to the workspace and the data within it. Creating a workspace should also create a user.

  Workspaces are independent of one another by design. A workspace can be deleted without affecting other workspaces.
  And they cannot be used together. This is to ensure that the data in one workspace cannot be accessed by another
  workspace user. "
  (:require
   [babashka.fs :as fs]
   [clj-yaml.core :as yaml]
   [clojure.string :as str]
   [java-time.api :as t]
   [malli.generator :as mg]
   [malli.util :as mut]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase.models.interface :as mi]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(mr/def ::plan.step
  [:multi {:dispatch :type}
   [:run-transform
    [:map [:name :string]]]
   [:create-model
    [:map [:transform-name
           {:description "The name of the transform to create a model from"} :string]]]])

(mr/def ::transform
  [:map
   [:name :string]
   [:description :nil]
   [:source :map]
   [:target :map]
   [:config {:optional true} :any]])

(mr/def ::plan
  [:map
   [:transforms [:sequential ::transform]]
   [:steps [:sequential ::plan.step]]])

;;;;;;;;;;; column checking:

(mr/def ::created_at
  [:string {:gen/fmap #(str (t/instant (hash %)))}])

;; maybe another table?
(mr/def ::activity-log [:map
                        [:name [:string {:min 1}]]
                        ;; needs a plan?
                        [:steps [:sequential
                                 [:map
                                  [:step-id [:int {:min 0}]]
                                  [:description :string]
                                  [:status [:enum :pending :running :completed :failed]]
                                  [:outcome {:optional true} [:enum :success :error :warning]]
                                  [:error-message {:optional true} :string]
                                  [:start-time [:string {:description "When the step started"}]]
                                  [:end-time {:optional true} [:maybe {:description "When the step ended"} :string]]
                                  [:created_at ::created_at]
                                  [:updated-at [:string {:description "When the step was last updated"}]]]]]])

;; look at transforms, make it match

;; delete me:
(mr/def ::document :any)
(mr/def ::user :any)
(mr/def ::permission :any)

(mr/def ::workspace.name
  [:string {:min 1}])

(mr/def ::workspace.description
  [:maybe :string])

(mr/def ::workspace
  [:map
   [:id              {:optional true} [:maybe [:int {:min 1}]]]
   [:name            [:ref ::workspace.name]]
   [:slug            {:optional true} [:maybe [:string {:min 1}]]]
   [:collection_id   {:optional true} [:maybe [:int {:min 1}]]]
   [:name            [:string {:min 1}]]
   [:description     {:optional true} [:ref ::workspace.description]]
   [:created_at      [:schema
                      {:description "The date and time the workspace was created"}
                      (ms/InstanceOfClass java.time.OffsetDateTime)]]
   [:updated_at      [:schema
                      {:description "The date and time the workspace was last updated"}
                      (ms/InstanceOfClass java.time.OffsetDateTime)]]
   [:plan            ::plan]
   [:activity_logs   [:sequential ::activity-log]] ;; This should maybe be another table:
   [:transforms      [:sequential ::transform]]
   [:documents       [:sequential ::document]]
   [:users           [:sequential ::user]]
   [:data_warehouses [:map-of {:description "data warehouse id -> isolation info"} :int :map]]
   [:documents       [:sequential ::document]]
   [:collection_id   pos-int?]
   [:api_key_id      pos-int?]
   [:attributes      {:optional true} [:maybe [:map-of :string :any]]]])

(def entity-cols
  "Columns that are considered entities in the workspace model. They are stored as json on the workspace table."
  [:plans :activity_logs :transforms :documents :users :data_warehouses :permissions])

(mr/def ::entity-column (into [:enum] entity-cols))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(defn- generate-slug
  "Generates a unique slug for the workspace based on its name.
   Uses `gensym` to ensure uniqueness, especially useful for testing or when names might collide."
  [{:keys [name]}]
  (str (str/replace name " " "_") "_" (gensym "")))

(t2/define-before-insert :model/Workspace
  [workspace]
  (assoc workspace :slug (generate-slug workspace)))

(t2/define-before-delete :model/Workspace
  [{api-key-id :api_key_id, :as workspace}]
  (println "api-key-id:" api-key-id) ; NOCOMMIT
  (u/prog1 workspace
    (t2/delete! :model/ApiKey :id api-key-id)))

(t2/deftransforms :model/Workspace
  {:plans           mi/transform-json
   :activity_logs   mi/transform-json
   :transforms      mi/transform-json
   :documents       mi/transform-json
   :users           mi/transform-json
   :data_warehouses mi/transform-json
   :permissions     mi/transform-json
   :attributes      mi/transform-json})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- sort-toplevel-keys
  "Sorts top-level keys in the order they're defined in the schema."
  [k1 k2]
  (let [order (zipmap (mut/keys (mr/resolve-schema ::workspace)) (range))
        a (get order k1)
        b (get order k2)]
    (if (and a b)
      (compare a b)
      (compare (name k1) (name k2)))))

(defn- created-at-sort
  "Sort a collection of workspaces by their `created_at` timestamp, newest first.
   Handles nil or invalid created_at values by treating them as oldest."
  [xs]
  (vec (sort-by (fn [item]
                  (try
                    (when-let [created_at (get item :created_at)]
                      (t/instant created_at))
                    (catch Exception _
                      ;; Return a very old instant for invalid dates
                      (t/instant "1970-01-01T00:00:00Z"))))
                #(compare %2 %1) ; Reverse comparison for newest first
                xs)))

(defn sort-workspace
  "Required for a stable diff in a yaml view"
  [workspace]
  (-> (into (sorted-map-by sort-toplevel-keys) workspace)
      (update :documents (fnil (comp vec sort) []))
      (update :plans (fnil created-at-sort []))
      (update :transforms (fnil created-at-sort []))
      (update :users (fnil created-at-sort []))
      (update :permissions (fnil created-at-sort []))))

(defn transform-table-dependencies
  "Identifies the database tables that a transform depends on.

   For workspace transforms, this function takes a transform object and returns
   a set of table IDs that the transform's source query depends on.

   Args:
   - transform: A transform object with :source containing query information

   Returns:
   - A set of table IDs (integers) that the transform depends on"
  [transform]
  (when-let [db-id (get-in transform [:source :query :database])]
    (qp.store/with-metadata-provider db-id
      (#'transforms.ordering/transform-deps transform))))

(defn workspace-transform-dependencies
  "Analyzes all transforms in a workspace and returns their table dependencies.

   Args:
   - workspace: A workspace object containing transforms

   Returns:
   - A map of transform name -> set of table IDs that transform depends on"
  [workspace]
  (into {}
        (keep (fn [transform]
                (when-let [deps (transform-table-dependencies transform)]
                  [(:name transform) deps])))
        (:transforms workspace [])))

(defn transform-table-dependencies-detailed
  "Returns detailed information about the tables a transform depends on.

   Args:
   - transform: A transform object with :source containing query information

   Returns:
   - A seq of maps containing table details: {:id, :name, :schema, :display_name, etc.}"
  [transform]
  (when-let [table-ids (transform-table-dependencies transform)]
    (when (seq table-ids)
      (t2/select [:model/Table :id :name :schema :display_name :description :db_id]
                 :id [:in table-ids]))))

(defn workspace-transform-dependencies-detailed
  "Returns detailed table dependency information for all transforms in a workspace.

   Args:
   - workspace: A workspace object containing transforms

   Returns:
   - A map of transform name -> seq of detailed table information"
  [workspace]
  (into {}
        (keep (fn [transform]
                (when-let [deps (transform-table-dependencies-detailed transform)]
                  [(:name transform) deps])))
        (:transforms workspace [])))

(comment
  (require '[clojure.walk :as walk])

  (require '[malli.core :as mc] '[malli.error :as me] '[malli.util :as mut] '[metabase.util.malli :as mu]
           '[metabase.util.malli.describe :as umd] '[malli.provider :as mp] '[malli.generator :as mg]
           '[malli.transform :as mtx] '[metabase.util.malli.registry :as mr] '[malli.json-schema :as mjs])

  (defn super-get [m k]
    (let [found (volatile! [])]
      (walk/postwalk
       (fn [x]
         (when (and (coll? x)
                    (= 2 (count x))
                    (= k (first x)))
           (vswap! found conj (second x)))
         x)
       m)
      @found))

  (transform-table-dependencies (:transforms (sort-workspace (t2/select-one :model/Workspace 254))))
  ;; correct order:
  ;; => ("2025-08-08T21:16:50.420896Z"
  ;;     "2025-08-08T21:13:40.567837Z"
  ;;     "2025-08-08T21:07:45.052178Z"
  ;;     "2025-08-08T21:03:43.194484Z"
  ;;     "2025-08-08T20:07:45.709135Z")

;; => ("2025-08-08T20:07:45.709135Z"
;;     "2025-08-08T21:16:50.420896Z"
;;     "2025-08-08T21:13:40.567837Z"
;;     "2025-08-08T21:07:45.052178Z"
;;     "2025-08-08T21:03:43.194484Z")
  )

(mu/defn- ->yaml [workspace :- ::workspace]
  (yaml/generate-string (sort-workspace workspace) :dumper-options {:flow-style :block}))
