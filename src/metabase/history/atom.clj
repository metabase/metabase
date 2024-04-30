(ns metabase.history.atom
  (:require [clojure.pprint :as pprint]
            [hyperfiddle.rcf :as rcf]
            [malli.core :as mc]
            [metabase.api.common :as api]
            [metabase.models.card :as card]
            [metabase.util.malli :as mu]
            [toucan2.core :as t2]))

(comment (rcf/enable!))
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Branching ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def *current-branch
  "`*current-branch` is nil when no branching is enabled, and will match a branch-id when a branch is enabled for this code-path.
  It controls where cards/dashboards are created, updated, deleted, and read from."
  (atom nil))

;; sample data
(def create-card-data
  "Data to create a simple card, as in `card/create-card!`"
  {:description nil,
   :collection_position nil,
   :result_metadata nil,
   :collection_id nil,
   :name "Orders, 1 row",
   :type :question,
   :dataset_query {:database 66, :type "query", :query {:source-table 184, :limit 1}},
   :display "table",
   :visualization_settings {}})

(declare branch-by-id)

;;looks like a setting, but it isnt
(defn set-current-branch! [branch-id]
  "Sets the current branch to the given branch-id."
  (when-not (= nil branch-id)
    (assert (branch-by-id branch-id) "Branch does not exist."))
  (reset! *current-branch branch-id))

(defn current-branch
  "Returns the current branch, or nil if no branch is enabled."
  []
  @*current-branch)

(rcf/tests "setting/getting branch"
           (set-current-branch! 7) :throws AssertionError
           (set-current-branch! nil) := nil
           (current-branch) := nil)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; entity Store ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def BranchMap
  [:map-of
   :int ;;branch-id
   [:map [:id :int]
    [:name :string] ;; branch names to be unique
    [:status [:enum :not-approved :approved]]]])

(def BranchDelta
  [:multi {:dispatch :op}
   ;; create needs the new shape of the entity TODO: how the heck does create work? it needs an id?
   [:create [:map [:op [:= :create]] [:id :int] [:type :keyword] [:data :map]]]
   ;; update needs the new shape of the entity to merge with the existing entity
   [:update [:map [:op [:= :update]] [:id :int] [:type :keyword] [:data :map]]]
   ;; delete doesn't need any data:
   [:delete [:map [:op [:= :delete]] [:id :int] [:type :keyword]]]])

(def EntityMap
  [:map-of
   ;; [branch-id instance  model-id]
   [:tuple :int       :keyword :int]
   BranchDelta])

(def EntityStore "The entity store map shape"
  [:map
   [:branches BranchMap]
   [:entities EntityMap]])

(rcf/tests "a shape that conforms:"
           (def entity-store-ex {:branches {1 {:id 1 :name "my-branch" :status :not-approved}
                                            2 {:id 2 :name "another-branch" :status :approved}}
                                 ;; entities go from
                                 ;; [branch-id instance model-id] -> value as it would come in from `card/create-card!`
                                 :entities {[1 :model/Card 88] {:type :model/Card :id 88 :op :delete}
                                            [2 :model/Card 88] {:type :model/Card
                                                                :id 88
                                                                :op :update
                                                                :data (-> create-card-data
                                                                          (assoc :name "Branch 2"))}}})

           (mc/validate EntityStore entity-store-ex) := true)

(def *entity-store (atom {}))
#_:clj-kondo/ignore ;;nocommit
(require '[malli.core :as mc] '[malli.error :as me] '[malli.util :as mut] '[metabase.util.malli :as mu]
         '[metabase.util.malli.describe :as umd] '[malli.provider :as mp] '[malli.generator :as mg]
         '[malli.transform :as mtx])

(add-watch *entity-store ::checker (fn [_ _ _ new]
                                     (when-not (mc/validate EntityStore new)
                                       (println "Broken stuff in entity-store:")
                                       (println (me/humanize (mc/explain EntityStore new))))))

(let [*id (atom 100000)]
  (defn id! "gets the next id" [] (swap! *id inc))
  (defn neg-id! "gets the next negative id" [] (* -1 (swap! *id inc))))

(defn- seek [f coll] (reduce (fn [acc x] (if (f x) (reduced x) acc)) nil coll))

(defn ^:api branch-by-name
  "Returns nil if no branch by that name exists. Otherwise, returns the branch."
  [branch-name]
  (->> @*entity-store :branches vals (seek #(= branch-name (:name %)))))

(defn ^:api branch-by-id
  "Returns nil if no branch with that id exists. Otherwise, returns the branch."
  [branch-id]
  (get-in @*entity-store [:branches branch-id]))

(defn ^:api set-branch-status
  [branch-id status]
  (swap! *entity-store update-in [:branches branch-id] assoc :status status))

(rcf/tests "cannot set invalid branch" (set-current-branch! 99) :throws AssertionError)

(defn ^:api create-branch!
  "If the branch already exists, returns its `branch-id`. Otherwise, creates a new branch and returns the `branch-id`."
  [branch-name & [id]]
  (let [id (or (:id (branch-by-name branch-name)) id (id!))]
    (swap! *entity-store assoc-in [:branches id]
           {:id id
            :name branch-name
            :status :not-approved})
    id))

(mu/defn ^:api add-delta-to-branch!
  "Given branch-name, entity type and id, and branch-delta, adds the entity to the branch."
  [branch-id :- :int type :- :keyword entity-id :- :int
   {:keys [op data]} :- [:map
                         [:op [:enum :create :update :delete]]
                         [:data {:optional true} [:maybe :map]]]]
  (swap! *entity-store
         assoc-in
         [:entities [branch-id type entity-id]]
         (cond
           (= op :create) (throw (ex-info "Create on branch not implemented" {})) ;; TODO: What is the Id here?
           (= op :update) {:id entity-id :type type :op :update :data data}
           (= op :delete) {:id entity-id :op :delete :type type})))

(defn delete-branch* [store branch-id]
  (-> store
      (update :branches dissoc branch-id)
      (update :entities
              (fn [ent]
                (into {}
                      (remove
                       (fn [[[bid _ _] _]] (= branch-id bid))
                       ent))))))

(rcf/tests "creating branches"
           (reset! *entity-store {:branches {} :entities {}})

           (create-branch! "my-branch-seven")
           := 100001

           (current-branch) := nil

           (set-current-branch! nil)
           (current-branch) := nil

           (set-current-branch! 100001)
           (current-branch) := 100001)

(defn ^:api delete-branch! [branch-id]
  "Deletes the branch and all its entities."
  (swap! *entity-store delete-branch* branch-id))

(mu/defn ^:api entities-for-branch-id
  "Returns entities for the given branch. Or nil if the branch doesn't exist."
  [branch-id]
  "Returns the entities for the given branch."
  (->> @*entity-store
       :entities
       (keep #(let [[b-id _ _] (key %)] (when (= b-id branch-id) (val %))))
       vec))

(mu/defn ^:api get-branched-entity [branch-id entity-type entity-id]
  "Returns the entity for the given branch. Or nil if the branch or entity doesn't exist."
  (get-in @*entity-store [:entities [branch-id entity-type entity-id]]))

(defmulti divert-read
  "Called to alter reads on entities iff a branch is enabled. Only ever called when a branch is enabled.
   If the entity is not found in the branch, returns the entity unedited.
   You probably want [[maybe-branchify-entity]] instead."
  (fn [branch-id op entity-type entity-id & [entity]]
    (assert (some? branch-id) "branchify-entity called without a branch enabled.")
    [op entity-type]))

(defmethod divert-read [:create :model/Card] ;; reading it is easy actually
  [branch-id _op entity-type entity-id _entity]
  (:data (get-in @*entity-store [:entities [branch-id entity-type entity-id]])))

(defmethod divert-read [:delete :model/Card]
  [_branch-id _op _entity-type _entity-id _entity]
  nil)

(defmethod divert-read [:update :model/Card]
  [branch-id _op entity-type entity-id entity]
  (merge entity (:data (get-in @*entity-store [:entities [branch-id entity-type entity-id]]))))

(defn maybe-divert-read* [branch-id entity-type entity-id entity]
  (if (some? (branch-by-id branch-id)) ;; no branch exists
    (if-let [branched-entity (get-branched-entity branch-id entity-type entity-id)]
      (divert-read branch-id (:op branched-entity) entity-type entity-id entity)
      entity)
    entity))

(defn maybe-divert-read [entity-type entity-id & [entity]]
  (maybe-divert-read* @*current-branch entity-type entity-id
                      (or entity (t2/select-one entity-type entity-id))))

(rcf/tests "branchify-entity -- reading an updated card"
           (set-current-branch! nil)

           (def card-88 (t2/select-one :model/Card 88))

           (maybe-divert-read :model/Card 88) := card-88
           (:name (maybe-divert-read :model/Card 88)) := (:name card-88)

           (set-current-branch! 100001) := 100001

           (:name (maybe-divert-read :model/Card 88)) := "FOO"

           (keys (maybe-divert-read :model/Card 88)) := (keys card-88))

(rcf/tests "delete a card on a branch"

           (rcf/tests
            "branch user decides to update a card on a branch"
            (add-delta-to-branch! 100001 :model/Card 88 {:op :update :data {:name "FFOOOPP"}})
            :=
            {:branches {100001 {:id 100001, :name "my-branch-seven", :status :not-approved}},
             :entities {[100001 :model/Card 88] {:id 88, :type :model/Card, :op :update, :data {:name "FFOOOPP"}}}})

           (rcf/tests
            "branch user decides to delete a card on a branch"
            (add-delta-to-branch! 100001 :model/Card 88 {:op :delete})
            :=
            {:branches {100001 {:id 100001, :name "my-branch-seven", :status :not-approved}},
             :entities {[100001 :model/Card 88] {:id 88, :op :delete, :type :model/Card}}})

           ;; branching off:
           (maybe-divert-read* nil :model/Card 88 card-88) := card-88

           ;; set branching off
           (set-current-branch! nil)
           (maybe-divert-read :model/Card 88) := card-88

           ;; can't use set-current-branch! with a branch that doesn't exist, but can test it:
           ;; branch d.n.e.
           (maybe-divert-read* 999 :model/Card 88 card-88) := card-88
           (set-current-branch! nil))



(defmulti divert-write
  (fn [branch-id entity-type entity-id op & [data]] [op entity-type]))

;; All the creates are an issue
(defmethod divert-write [:create :model/Card] [branch-id entity-type entity-id op & [data]]
  (throw (ex-info "Creating new cards in branch unimplemented!" {})))

(defmethod divert-write [:delete :model/Card] [branch-id entity-type entity-id op & [data]]
  (add-delta-to-branch! branch-id entity-type entity-id {:op :delete}))

(defmethod divert-write [:update :model/Card] [branch-id entity-type entity-id op & [data]]
  (add-delta-to-branch! branch-id entity-type entity-id {:op :update :data data}))

(mu/defn maybe-divert-write
  "Writes to the branch if a branch is enabled, otherwise writes to the main entity store.
   Returns the updated entity for the branch."
  [entity-type entity-id op :- [:enum :create :update :delete] & [data]]
  (if (some? (branch-by-id @*current-branch))
    (do (divert-write @*current-branch entity-type entity-id op data)
        (merge (t2/select-one entity-type entity-id) data))
    (t2/update! entity-type entity-id op data)))

(rcf/tests "maybe-divert-write a card, with branch enabled"

           (divert-write 100001 :model/Card 88 :update {:name "FOO"})

           (entities-for-branch-id 100001) := [{:id 88, :type :model/Card, :op :update, :data {:name "FOO"}}])

(defmulti publish! (fn [user-id branch-id entity-type entity-id {:keys [op data] :as delta}]
                     entity-type))

(defmethod publish! :model/Card [user-id branch-id _entity-type entity-id {:keys [op data]}]
  (case op
    :create (do
              (card/create-card! (dissoc data :id) user-id)
              (t2/insert! :model/Card entity-id (dissoc data :id)))
    :update (let [card-before-update (t2/hydrate (t2/select-one :model/Card entity-id) [:moderation_reviews :moderator_details])
                  card-updates (merge card-before-update data)]
              (card/update-card! {:card-before-update card-before-update
                                  :card-updates card-updates
                                  :actor user-id}))
    :delete (t2/delete! :model/Card entity-id)))

(mu/defn ^:api publish-branch!
  "Publishes the branch, applying all changes to the live environment."
  [branch-id user-id :- pos-int?]
  ;; TODO: check write permissions here!
  (doseq [{:keys [id type op data]} (entities-for-branch-id branch-id)]
    (publish! user-id branch-id type id {:op op :data data}))
  (delete-branch! branch-id))

(rcf/tests "publishing a branch"
           (def branched-card (maybe-divert-read :model/Card 88))

           (binding [api/*current-user-id* 13371338] ;; remember to bind current-user-id when updating a card!
             (publish-branch! 100001 13371338))

           (:name (t2/select-one :model/Card 88)) := "FOO"

           (branch-by-id 100001) := nil)


(println)
