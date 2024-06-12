#_:clj-kondo/ignore
(ns metabase.history.atom
  (:require [clojure.pprint :as pprint]
            [hyperfiddle.rcf :as rcf]
            [malli.core :as mc]
            [metabase.api.common :as api]
            [metabase.util :as u]
            [metabase.util.log :as log]
            [metabase.util.malli :as mu]
            [toucan2.core :as t2]))


(comment (rcf/enable!))
;;; State ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#_:clj-kondo/ignore
(def empty-entity-store
  {:current-branch nil
   :branches {}
   :entities {}})

#_:clj-kondo/ignore{:missing-docstring true}
(defonce *entity-store
  ;;"all branches and info for entities on branches get stored here"
  (atom empty-entity-store))

(comment

  (add-watch *entity-store ::logger
             (fn [_ _ _ new]
               (spit "entity_store.edn"
                     (str "\n" (u/pprint-to-str new))
                     :append true)))

  (add-watch *entity-store ::saver
             (fn [_ _ _ new]
               (spit "current_entity_store.edn" (u/pprint-to-str new))))

  (defn load-atom! []
    (reset! *entity-store (read-string (slurp "current_entity_store.edn"))))

  (load-atom!)


  (reset! *entity-store empty-entity-store)

  @*entity-store

  (set-current-branch! (create-branch! "Bryan's Branch"))

  (set-current-branch! nil)

  @*entity-store


  )

;;; Util ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- seek [f coll] (reduce (fn [acc x] (if (f x) (reduced x) acc)) nil coll))

;;; Branching ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn ^:api branch-by-id
  "Returns nil if no branch with that id exists. Otherwise, returns the branch."
  [branch-id]
  (get-in @*entity-store [:branches branch-id]))

(defn set-current-branch!
  "Sets the current branch to the given branch-id.

  Returns: the branch-id that was set, a number or nil"
  [branch-id]
  (when-not (nil? branch-id)
    (assert (some? (branch-by-id branch-id)) "Branch does not exist."))
  (swap! *entity-store assoc :current-branch branch-id)
  branch-id)

(defn current-branch
  "Returns the current branch, or nil if no branch is enabled."
  []
  (:current-branch @*entity-store))

(defn ^:api branch-by-name
  "Returns nil if no branch by that name exists. Otherwise, returns the branch."
  [branch-name]
  (some->> @*entity-store :branches vals (seek #(= branch-name (:name %)))))

(mu/defn ^:api set-branch-status
  [branch-id status :- [:enum :not-approved :approved]]
  (swap! *entity-store update-in [:branches branch-id] assoc :status status))

(defn delete-branch* [store branch-id]
  (-> store
      (update :branches dissoc branch-id)
      (update :entities
              (fn [ent]
                (into {}
                      (remove
                       (fn [[[bid _ _] _]] (= branch-id bid))
                       ent))))))

;; need to do something about id generation
(def ^:private initial-id 100000)
(def ^:private *id (atom initial-id))
(defn id! "gets the next id" [] (swap! *id inc))

(defn ^:api create-branch!
  "If the branch already exists, returns its `branch-id`. Otherwise, creates a new branch and returns the `branch-id`."
  [branch-name & [id]]
  (let [id (or (:id (branch-by-name branch-name)) id (id!))]
    (swap! *entity-store assoc-in [:branches id]
           {:id id
            :name branch-name
            :status :not-approved})
    id))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; entity Store ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def BranchMap
  "The branch map shape."
  [:map-of
   :int ;;branch-id
   [:map [:id :int]
    [:name :string] ;; branch names to be unique
    [:status [:enum :not-approved :approved]]]])

(def BranchDelta
  "The branch delta shape."
  [:multi {:dispatch :op}
   ;; create needs the new shape of the entity
   [:create [:map [:op [:= :create]] [:id :int] [:model :keyword] [:data :map]]]
   ;; update needs the new shape of the entity to merge with the existing entity
   [:update [:map [:op [:= :update]] [:id :int] [:model :keyword] [:data :map]]]
   ;; delete doesn't need any data:
   [:delete [:map [:op [:= :delete]] [:id :int] [:model :keyword]]]])

(def EntityMap
  [:map-of
   ;; [branch-id instance  model-id]
   [:tuple :int       :keyword :int]
   BranchDelta])

(def EntityStore "The entity store map shape"
  [:map
   [:current-branch {:optional true} [:maybe :int]]
   [:branches BranchMap]
   [:entities EntityMap]])

#_:clj-kondo/ignore ;;nocommit
(require '[malli.core :as mc] '[malli.error :as me] '[malli.util :as mut] '[metabase.util.malli :as mu]
         '[metabase.util.malli.describe :as umd] '[malli.provider :as mp] '[malli.generator :as mg]
         '[malli.transform :as mtx])

(add-watch *entity-store ::checker (fn [_ _ _ new]
                                     (when-not (mc/validate EntityStore new)
                                       (println "Broken stuff in entity-store:")
                                       (println (me/humanize (mc/explain EntityStore new))))))

(mu/defn ^:api get-branched-entity
  "Returns the entity for the given branch. Or nil if the branch or entity doesn't exist."
  [branch-id model entity-id]
  (get-in @*entity-store [:entities [branch-id model entity-id]]))

(defn ^:api add-delta-to-branch!
  "Given branch-name, entity model and id, and branch-delta, adds the entity to the branch."
  [branch-id ;; :- :int
   model ;; :- :keyword
   entity-id ;; :- :int
   {:keys [op data]} ;; :- [:map
   ;;     [:op [:enum :create :update :delete]]
   ;;     [:data {:optional true} [:maybe :map]]]
   ]
  (def branch-id branch-id)
  (def model model)
  (def entity-id entity-id)
  (def op op)
  (def data data)
  (let [branched-entity (get-branched-entity branch-id model entity-id)]
    (def branched-entity branched-entity)
    (swap! *entity-store
           assoc-in
           [:entities [branch-id model entity-id]]
           (cond
             (= op :create) {:id entity-id :model model :op :create :data (assoc data :id entity-id)}
             (= op :update) {:id entity-id
                             :model model
                             ;; on a branch, if you Create, then Update something, it should get published as a Create still.
                             :op (or (:op branched-entity) :update)
                             :data (-> @*entity-store (:data branched-entity) (merge data))}
             (= op :delete) {:id entity-id :op :delete :model model}))))


(defn ^:api delete-branch!
  "Deletes the branch and all its entities."
  [branch-id]
  (swap! *entity-store delete-branch* branch-id))

(mu/defn ^:api entities-for-branch-id
  "Returns entities for the given branch. Or nil if the branch doesn't exist."
  [branch-id]
  (->> @*entity-store
       :entities
       (keep #(let [[b-id _ _] (key %)] (when (= b-id branch-id) (val %))))
       vec))

(defmulti divert-read
  "Called to alter reads on entities iff a branch is enabled. Only ever called when a branch is enabled.
   If the entity is not found in the branch, returns the entity unedited.
   You probably want [[maybe-divert-read]] instead."
  (fn [branch-id model entity-id op & [entity]]
    (assert (some? branch-id) "branchify-entity called without a branch enabled.")
    [op model]))

(defmethod divert-read
  ;; "Reads a card from the branch. If the card doesn't exist in the branch, passes through the card from the main entity store."
  [:create :model/Card]
  [branch-id model entity-id _op _entity]
  (:data (get-in @*entity-store [:entities [branch-id model entity-id]])))

(defmethod divert-read [:delete :model/Card]
  [_branch-id _model _entity-id _op _entity]
  nil)

(defmethod divert-read [:update :model/Card]
  [branch-id model entity-id _op entity]
  (merge entity (:data (get-in @*entity-store [:entities [branch-id model entity-id]]))))

(defn maybe-divert-read* [branch-id model entity-id entity fallback-query]
  (def branch-id branch-id)
  (def model model)
  (def entity-id entity-id)
  (def entity entity)
  (def be (get-branched-entity branch-id model entity-id))
  (t2/instance model ;; this is needed to make event publishing work correctly
               (if (some? (branch-by-id branch-id)) ;; no branch exists
                 (if-let [branched-entity (get-branched-entity branch-id model entity-id)]
                   (divert-read branch-id model entity-id (:op branched-entity) entity)
                   (or entity (fallback-query)))
                 (or entity (fallback-query)))))

(defn maybe-divert-read
  [model entity-id & [entity fallback-query]]
  (maybe-divert-read*
   (current-branch)
   model
   entity-id
   (or entity
       (t2/select-one model entity-id)
       (and (current-branch)
            ;; if we are on a branch, there may be a created entity, which means there is no entity in the live branch.
            (:data (get-branched-entity (current-branch) model entity-id))))
   (or fallback-query (constantly nil))))

;; Writing to the branch

(defmulti divert-write
  "Called to alter writes on entities iff a branch is enabled. Only ever called when a branch is enabled.
   You probably want [[maybe-divert-write]] instead which is current-branch aware."
  (fn [branch-id model entity-id op & [data]] [op model]))

(mu/defn maybe-divert-write
  "Writes an update to the branch if a branch is enabled, otherwise writes to the main entity store.
   Returns the updated entity for the branch."
  [model entity-id op :- [:enum :create :update :delete] & [data]]
  (if (some? (branch-by-id (current-branch)))
    (do (divert-write (current-branch) model entity-id op data)
        (merge (t2/select-one model entity-id) data))
    (case op
      :create (t2/insert! model data)
      :update (t2/update! model entity-id data)
      :delete (t2/delete! model entity-id))))

(defmulti publish!
  "Make the changes on branch live. Called when a branch is published. These need to be implemented in the models namespaces to avoid circular dependencies."
  (fn [_user-id _branch-id model _entity-id {:keys [op data] :as _delta}] model))

(mu/defn ^:api publish-branch!
  "Publishes the branch, applying all changes to the live environment."
  [branch-id user-id :- pos-int?]
  (when (some? (current-branch))
    (throw (ex-info "Branch mustn't be enabled when publishing." {:branch (current-branch)})))
  ;; Q: Should we check can-write? permissions here?
  (t2/with-transaction [_]
    (doseq [{:keys [id model op data]} (entities-for-branch-id branch-id)]
      (log/warn "Publishing:" [:user-id user-id :id id :model model] {:op op :data data})
      (publish! user-id branch-id model id {:op op :data data}))))

(comment

  ;; # Supported Workflows:

  ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
  ;; 1. create a branch, update 1 card, run the card query, publish the branch, delete the branch
  ;;     note: update includes moving it into the trash

  ;; start from scratch:
  (reset! *entity-store empty-entity-store)

  ;; we are not on a branch, now make a new card:

  ;; create and set branch
  (set-current-branch! (create-branch! "workflow-1-branch"))

  ;; update the card: e.g. the title and row-count.

  ;; visualize the card, it should reflect the branched changes.

  ;; swap off of the branch:
  (set-current-branch! nil)

  ;; refresh, to see the live version

  ;; publish the branch to overwrite the live version:
  (publish-branch! (create-branch! "workflow-1-branch") 13371338)

  ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
  ;; 2. create a branch, create a card, publish the branch, delete the branch

  ;; start from scratch:
  ;; (reset! *entity-store empty-entity-store)

  ;; create and set branch
  (set-current-branch! (create-branch! "workflow-2-branch"))

  ;; Make a new card called "Reviews ob", dont add to dashboard (wip)
  ;; visualize the card, it should run the new card's query.

  ;; observe the url: http://localhost:3000/question/100041-reviews-ob

  ;; swap off of the branch:
  (set-current-branch! nil)
  ;; refresh, to see the live version (a 404 "Something's gone wrong")
  ;; might want to show a hint that there is actually a card with that "id"?

  ;; swap back onto the branch
  (set-current-branch! (create-branch! "workflow-2-branch"))

  ;; refresh, to see the branched (good) version again

  ;; back to live mode:
  (set-current-branch! nil)

  ;; refresh, it's broken again

  ;; publish the branch to create the Live card version:
  (publish-branch! (create-branch! "workflow-2-branch") 13371338)

  ;; refresh again, in live mode, and see the new card:

  ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
  ;; 3. create a branch, create card A, update card A, publish the branch, delete the branch

  ;; start from scratch:
  ;; (reset! *entity-store empty-entity-store)

  ;; create and set branch
  (set-current-branch! (create-branch! "workflow-3-branch"))

  ;; Make a new card called "Reviews ob 3", dont add to dashboard (not supported)

  ;; [Visualize] the card, it should run the new card's query.

  ;; Make a new card called "Products ob 3", dont add to dashboard (not supported)

  ;; [Visualize] the card, it should run the new card's query.

  ;; observe the url: http://localhost:3000/question/1000xx-reviews-ob-3

  ;; change something about the card:

  ;; swap off of the branch:
  (set-current-branch! nil)

  ;; refresh, to see the live version (a 404 "Something's gone wrong")

  ;; swap back onto the branch
  (set-current-branch! (create-branch! "workflow-3-branch"))

  ;; refresh, to see the good version again

  ;; back to live mode:
  (set-current-branch! nil)

  ;; refresh, it's broken again

  ;; publish the branch to create the Live card version:
  (publish-branch! (create-branch! "workflow-3-branch") 13371338)

  ;; refresh again, in live mode, and see the new card:

  ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
  ;; 4.
  ;;   - create a branch
  ;;   - create card A
  ;;   - update card A
  ;;   - create card B
  ;;   - update card B
  ;;   - publish the branch
  ;;   - delete the branch

  ;; start from scratch:
  ;;(reset! *entity-store empty-entity-store)

  ;; create and set branch
  (set-current-branch! (create-branch! "workflow-4-branch"))

  ;; Make a new card called "Reviews ob 4", dont add to dashboard (not supported)

  ;; [Visualize] the card, it should run the new card's query.

  ;; change anything about the card

  ;; Make a new card called "Accounts ob 4", dont add to dashboard (not supported)

  ;; [Visualize] the card, it should run the new card's query.

  ;; make an update to the card

  ;; swap off of the branch:
  (set-current-branch! nil)

  ;; refresh, to see the live version (a 404)

  ;; swap back onto the branch
  (set-current-branch! (create-branch! "workflow-4-branch"))

  ;; refresh, to see the good version again

  ;; back to live mode:
  (set-current-branch! nil)

  ;; refresh, it's broken again

  ;; publish the branch to create the Live card version:
  (publish-branch! (create-branch! "workflow-4-branch") 13371338)

  ;; refresh again, in live mode, and see the new card:

  ;; delete the branch:
  (delete-branch! (create-branch! "workflow-4-branch"))

  ;; @*entity-store:

  (update @*entity-store :entities update-vals (constantly :a-card))
  ;;=>



  )
