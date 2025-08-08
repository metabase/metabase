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
  workspace user.

  "
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [babashka.fs :as fs]
   [clj-yaml.core :as yaml]
   [clojure.string :as str]
   [java-time.api :as t]
   [malli.generator :as mg]
   [malli.util :as mut]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(mr/def ::created_at
  [:string {:gen/fmap #(str (t/instant (hash %)))}])

(mr/def ::plan [:map
                [:title :string]
                [:description :string]
                [:content :map]
                [:created_at ::created_at]])

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
(mr/def ::transform
  [:map
   [:name :string]
   [:description :string]
   [:source [:map
             [:type [:or :string]] #_[:enum "query" "table"]
             [:query {:optional true} [:map
                                       [:database {:description "ID of the source database"} :int]
                                       [:type :string] ;; native or query
                                       [:native {:optional true} [:map
                                                                  [:query :string]
                                                                  [:template-tags {:optional true} [:map]]]]]]]]
   [:target [:map [:name :string] [:type :string]]]
   [:created_at ::created_at]
   [:config {:optional true} [:map]]])

;; wip
(mr/def ::document [:int {:description "ID of a document in app-db" :min 1}])

(mr/def ::user
  [:map
   [:id :int]
   [:type :string] ;; workspace-user
   [:name :string]
   [:email :string]
   [:created_at ::created_at]
   ;; api-key?
   ;; db creds?
   ])

(mr/def ::data-warehouse
  [:map
   [:id [:int {:min 1}]]
   [:created_at ::created_at]
   [:type [:enum "read-only" "read-write"]]
   [:credentials :map]
   [:name :string]])

(mr/def ::permission
  [:map
   [:table :string]
   [:created_at ::created_at]
   [:permission [:enum "read" "write"]]])

(mr/def ::workspace
  [:map
   [:id {:optional true} [:maybe [:int {:min 1}]]]
   [:collection_id {:optional true} [:maybe [:int {:min 1}]]]
   [:name [:string {:min 1}]]
   [:description {:optional true} [:maybe :string]]
   ;; each plan, transofrm, and document(<-unsure) is basically a file abstraction
   [:plans [:sequential ::plan]]
   ;; This should maybe be another table:
   [:activity_logs [:sequential ::activity-log]]
   [:transforms [:sequential ::transform]]
   [:documents [:sequential ::document]]
   [:users [:sequential ::user]]
   [:data_warehouses [:sequential ::data-warehouse]]
   [:permissions [:sequential ::permission]]
   [:created_at [:any {:description "The date and time the workspace was created"}]]
   [:updated_at [:any {:description "The date and time the workspace was last updated"}]]])

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(t2/deftransforms :model/Workspace
  {:plans mi/transform-json
   :activity_logs mi/transform-json
   :transforms mi/transform-json
   :documents mi/transform-json
   :users mi/transform-json
   :data_warehouses mi/transform-json
   :permissions mi/transform-json})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- sort-toplevel-keys
  "Sorts top-level keys in the order they're defined in the schema."
  [k1 k2]
  (let [order (zipmap (mut/keys (mr/resolve-schema ::workspace)) (range))]
    (compare (get order k1 Integer/MAX_VALUE)
             (get order k2 Integer/MAX_VALUE))))

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
      (update :data_warehouses (fnil created-at-sort []))
      (update :permissions (fnil created-at-sort []))))

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

  (:transforms (sort-workspace (t2/select-one :model/Workspace 254)))
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

;; temp for testing
(mu/defn- write-yaml
  ([workspace] (write-yaml workspace {}))
  ([workspace :- ::workspace
    options :- [:map [:prefix :string]]]
   (let [file-name (str (:prefix options "")
                        (str/replace (:name workspace) " " "_") ".yaml")]
     (fs/create-dirs (fs/parent file-name))
     (println "Writing workspace to" file-name)
     (spit file-name (->yaml workspace)))))

(comment

  (let [w (mg/generate ::workspace {:size 1})]
    (write-yaml w {:prefix "yaml_samples/"})))
