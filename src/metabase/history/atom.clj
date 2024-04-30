(ns metabase.history.atom
  (:require [malli.core :as mc]
            [metabase.util.malli :as mu]
            [clojure.pprint :as pprint]
            [toucan2.core :as t2]
            [hyperfiddle.rcf :as rcf]))

(comment (rcf/enable!))
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; Branching ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def *current-branch
  "`*current-branch` is nil when no branching is enabled, and will match a branch-id when a branch is enabled for this code-path.
  It controls where cards/dashboards are created, updated, deleted, and read from."
  (atom nil))

;; del me
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

(defn set-current-branch! [branch-id]
  "Sets the current branch to the given branch-id."
  (when-not (= nil branch-id)
    (assert (branch-by-id branch-id) "Branch does not exist."))
  (reset! *current-branch branch-id))

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

(let [*id (atom 10)]
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

(rcf/tests "cannot set invalid branch" (set-current-branch! 99) :throws AssertionError)

(defn- insert-branch!
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
  [branch-id type entity-id {:keys [op data] :as #_:clj-kondo/ignore branch-delta} :- [:map
                                                                                         [:op [:enum :create :update :delete]]
                                                                                         [:data {:optional true} [:maybe :map]]]]
  (swap! *entity-store
         assoc-in
         [:entities [branch-id type entity-id]]
         (cond
           (= op :create) (throw (ex-info "Create on branch not implemented" {})) ;; TODO: What is the Id here?
           (= op :update) {:id entity-id :type type :op :update :data data}
           (= op :delete) {:id entity-id :op :delete :type type})))

(mu/defn ^:api create-branch!
  "Creates a branch and adds the given entities to it."
  [branch-name type+entity-id->branch-delta :- [:map-of
                                         [:tuple :keyword :int]
                                         [:map
                                          [:op [:enum :create :update :delete]]
                                          [:data :any]]]]
  (let [id (or (:id (branch-by-name branch-name)) (insert-branch! branch-name))]
    (doseq [[[type entity-id] branch-delta] type+entity-id->branch-delta]
      (add-delta-to-branch! id type entity-id branch-delta))
    @*entity-store))

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

(rcf/tests "creating branches"
           (reset! *entity-store {})
           @*entity-store := {}


           (create-branch! "my-branch-seven"
                           {[:model/Card 88] {:op :update
                                              :data {:name "Update Card Name on Branch 7"}}})
           := {:branches {11 {:id 11, :name "my-branch-seven", :status :not-approved}},
               :entities
               {[11 :model/Card 88]
                {:id 88, :type :model/Card, :op :update, :data {:name "Update Card Name on Branch 7"}}}}

           @*entity-store := *1)

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
           @*current-branch := nil

           (def card-88 (t2/select-one :model/Card 88))

           (maybe-divert-read :model/Card 88) := card-88

           (set-current-branch! 11) := 11

           (:name (maybe-divert-read :model/Card 88)) := "Update Card Name on Branch 7"

           (keys (maybe-divert-read :model/Card 88)) := (keys card-88))

(rcf/tests "delete a card on a branch"

           (add-delta-to-branch! 11 :model/Card 88 {:op :delete})
           :=
           {:branches {11 {:id 11, :name "my-branch-seven", :status :not-approved}},
            :entities {[11 :model/Card 88] {:id 88, :op :delete, :type :model/Card}}}


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

(mu/defn maybe-divert-write [entity-type entity-id op :- [:enum :create :update :delete] & [data]]
  (if (some? (branch-by-id @*current-branch))
    (divert-write @*current-branch entity-type entity-id op data)
    (t2/update! entity-type entity-id op data)))

(rcf/tests "maybe-divert-write a card, with branch enabled"

           (set-current-branch! 11)

           (maybe-divert-write :model/Card 88 :update {:name "FOO"})

           (entities-for-branch-id 11) := [{:id 88, :type :model/Card, :op :update, :data {:name "FOO"}}])


(defmulti publish! (fn [branch-id entity-type entity-id] entity-type))

(defmethod publish! :model/Card [branch-id _entity-type _entity-id]
  (let [entities (entities-for-branch-id branch-id)]
    (doseq [[_ entity] entities]
      (maybe-divert-write (:type entity) (:id entity) (:op entity) (:data entity)))))


#_(rcf/tests "get entites on branch"
           (entities-for-branch-id 11)
           :=
           [{:id 88,
             :type :model/Card,
             :op :update,
             :data {:name "Update Card Name on Branch 7", :description nil, :collection_position nil, :result_metadata nil, :collection_id nil, :type :question, :dataset_query {:database 66, :type "query", :query {:source-table 184, :limit 1}}, :display "table", :visualization_settings {}}}]


#_#_#_#_#_           (set-current-branch! 11)
           "publishing a branch"
           (def branched-card (maybe-divert-read :model/Card 88))

           (publish! 11 :model/Card 88)
           (get-in @*entity-store [:entities [11 :model/Card 88]]) := nil)


(println)
