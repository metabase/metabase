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
   [clj-yaml.core :as yaml]
   [clojure.string :as str]
   [lambdaisland.deep-diff2 :as ddiff]
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(mr/def ::workspace
  [:map
   [:name [:string {:min 1}]]
   [:description {:optional true} [:maybe :string]]
   [:created_at [:string {:description "The date and time the workspace was created"}]]
   [:updated_at [:string {:description "The date and time the workspace was last updated"}]]
   ;; each plan, transofrm, and document(<-unsure) is basically an abstract file
   [:plans {:optional true} [:sequential [:map
                                          [:title :string]
                                          [:description :string]
                                          [:content :map]
                                          [:created-at [:string {:description "When the plan was created"}]]]]]
   ;; maybe another table?
   [:activity_logs {:optional true} [:sequential [:map
                                                  [:name [:string {:min 1}]]
                                                  ;; needs a plan?
                                                  [:steps [:sequential
                                                           [:map
                                                            [:step-id :int]
                                                            [:description :string]
                                                            [:status [:enum :pending :running :completed :failed]]
                                                            [:outcome {:optional true} [:enum :success :error :warning]]
                                                            [:error-message {:optional true} :string]
                                                            [:start-time [:string {:description "When the step started"}]]
                                                            [:end-time {:optional true} [:maybe {:description "When the step ended"} :string]]
                                                            [:created-at [:string {:description "When the step was created"}]]
                                                            [:updated-at [:string {:description "When the step was last updated"}]]]]]]]]
   ;; look at transforms, make it match
   [:transforms {:optional true}
    [:sequential [:map
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
                  [:created-at :string]
                  [:config {:optional true} [:map]]]]]
   ;; wip
   [:documents {:optional true} [:sequential
                                 [:int {:description "ID of a document in app-db" :min 1}]]]
   [:users {:optional true} [:sequential [:map
                                          [:id :int]
                                          [:type :string] ;; workspace-user
                                          [:name :string]
                                          [:email :string]
                                          [:created-at :string]
                                          ;; api-key?
                                          ;; db creds?
                                          ]]]
   [:dwh {:optional true} [:sequential
                           [:map
                            [:id [:int {:min 1}]]
                            [:created-at :string]
                            [:type [:enum :read-only :read-write]]
                            [:credentials :map]
                            [:name :string]]]]
   ;; For permissions, we could keep a set of tables with read/write permissions
   [:permissions {:optional true}
    [:sequential
     [:map
      [:table :string]
      [:created-at :string]
      [:permission [:enum :read :write]]]]]])

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(t2/deftransforms :model/Workspace
  {:plans mi/transform-json
   :activity_log mi/transform-json
   :transforms mi/transform-json
   :documents mi/transform-json
   :users mi/transform-json
   :dwh mi/transform-json
   :permissions mi/transform-json})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- sort-workspace-keys
  "Sorts top-level keys in the order they're defined in the schema."
  [k1 k2]
  (let [order (zipmap (mut/keys (mr/resolve-schema ::workspace)) (range))]
    (compare (get order k1 Integer/MAX_VALUE)
             (get order k2 Integer/MAX_VALUE))))

(defn- sort-workspace
  "Required for a stable diff in a yaml view"
  [workspace]
  (let [top-level-sorted (into (sorted-map-by sort-workspace-keys) workspace)
        json-cols [:plans :activity-logs :transforms :documents :user :dwh :permissions]]
    ;; sort each json column value by :created-at
    (reduce (fn [acc col]
              (if-let [col-data (get top-level-sorted col)]
                (assoc acc col
                       (into (sorted-map-by #(compare
                                              (:created-at %1)
                                              (:created-at %2)))
                             col-data)))
              acc)
            top-level-sorted
            json-cols)))

(mu/defn write-yaml [workspace :- ::workspace]
  (let [file-name (str (str/replace (:name workspace) " " "_") ".yaml")
        sorted-workspace (sort-workspace workspace)]
    (spit file-name
          (yaml/generate-string sorted-workspace :dumper-options {:flow-style :block}))))

(comment

  (toucan2.tools.with-temp/with-temp-defaults :model/Workspace)
  ;; ZZZ
  (def cw (metabase-enterprise.workspaces.demo.create-realistic-workspace/create-customer-churn-workspace))

  (def cw2 (-> cw
               (assoc :name "Customer Churn Workspace 2")
               (update :dwh #(drop 1 %))
               (update :users conj {:id 1003
                                    :name "Extra Reader"
                                    :email "extra.reader@company.com"
                                    :type "reader"
                                    :created-at (str (java.time.Instant/now))})
               (update :transforms #(mapv (fn [t] (assoc t :name (str (:name t) " 2"))) %))
               (update :transforms conj (first (:transforms cw)))))

  (ddiff/pretty-print (ddiff/diff cw cw2))

  ;; TODO: insert it
  (t2/insert! :model/Workspace cw)

  (write-yaml cw)
  (write-yaml cw2))
