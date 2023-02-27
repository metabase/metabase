(ns dev.db-tracking
  "A set of utility function to track database changes.
  Use this when you want to observe changes of database models when doing stuffs on UI.

  How to use this?
    > (track! models/Dashboard models/Card models/DashboardCard)
    -- Go on UI and do stuffs like (i.e: update viz-settings of a dashcard).

    > (changes)
    ;; => {:report_card {:insert ...}}

  You can use [[reset-changes!]] to clear our all the current trackings.
  And [[untrack-all!]] or [[untrack!]] to stop tracking."
  (:require
   [clojure.pprint :as pprint]
   [metabase.util :as u]
   [methodical.core :as m]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.tools.before-delete :as t2.before-delete]
   [toucan2.tools.before-insert :as t2.before-insert]
   [toucan2.tools.before-update :as t2.before-update]))

(def ^:private tracking (atom {}))

(def ^:private tracked-models (atom #{}))

(defn- clean-tracking
  [tracking]
  (dissoc tracking :updated_at :created_at))

(defn- new-tracking
  "Add a tracking to the [[tracking]] atom.

    > (new-tracking :models/Card :insert {:name \"new card\"})
    instance

    > @tracking
    {:insert {:report_card [{:name \"new card\"}]}]}.

  For insert, track the instance as a map.
  For update, only track the changes."
  [model action row-or-instance]
  (let [model      (t2/resolve-model model)
        track-item (->> (case action
                          :update
                          (into {} (t2/changes row-or-instance))
                          (into {} row-or-instance))
                       clean-tracking)
        path       [(t2/table-name model) action]]
    ;; ideally this should be debug, but for some reasons this doesn't get logged
    (println (u/colorize :magenta :new-tracking) (u/colorize :magenta path))
    (pprint/pprint track-item)
    (swap! tracking update-in path concat [track-item])))

(defn- new-tracking-thunk
  [model action]
  (fn [_model row]
    (new-tracking model action row)
    row))

(def ^:private hook-and-actions
  "A list of toucan hooks that we will subscribed to when tracking a model."
  [;; will be better if we could use after-delete to get the inserted id, but toucan2 doesn't define a multimethod for after-insert
   [#'t2.before-insert/before-insert :after :insert]
   [#'t2.before-update/before-update :after :update]
   ;; we do before aux-method instead of :after for delete bacause the after method has input is number of affected rows
   [#'t2.before-delete/before-delete :before :delete]])

(defn- track-one!
  [model]
  (doseq [[hook aux-method action] hook-and-actions]
    (m/add-aux-method-with-unique-key! hook aux-method model (new-tracking-thunk model action) ::tracking)))

(defn track!
  "Start tracking a list of models.

  (track! 'Card 'Dashboard)"
  [& models]
  (doseq [model (map t2.model/resolve-model models)]
    (track-one! model)
    (swap! tracked-models conj model)))

(defn- untrack-one!
  [model]
  (doseq [[hook aux-method _action] hook-and-actions]
    (m/remove-aux-method-with-unique-key! hook aux-method model ::tracking)
    (swap! tracked-models disj model)))

(defn untrack!
  "Remove tracking for a list of models.

  (untrack! 'Card 'Dashboard)"
  [& models]
  (doseq [model (map t2.model/resolve-model models)]
    (untrack-one! model)))

(defn reset-changes!
  "Empty all the recorded changes."
  []
  (reset! tracking {}))

(defn untrack-all!
  "Quickly untrack all the tracked models."
  []
  (reset-changes!)
  (apply untrack! @tracked-models)
  (reset! tracked-models #{}))

(defn changes
  "Return all changes that were recorded."
  []
  @tracking)

(track! 'Collection)

(comment
  (require '[metabase.models :as models])
  (track! models/Dashboard models/Card models/DashboardCard)

  (reset-changes!)

  (untrack! models/Dashboard models/Card models/DashboardCard)
  (untrack-all!))
