(ns dev.model-tracking
  "A set of utility function to track model changes.
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
   [toucan2.tools.before-update :as t2.before-update]
   [toucan2.util :as t2.util]))


(def changes*
  "An atom to store all the changes of models that we currently track."
  (atom {}))

(def ^:private tracked-models (atom #{}))

(defn on-change
  "When a change occurred, execute this function.

  Currently it just prints the console out to the console.
  But if you prefer other method of debugging (i.e: tap), you can redef this function

    (alter-var-root #'model-tracking/on-change (fn [path change] (tap> [path change])))


  - path: is a element vector [model, action]
  - change-info: is a map of the change for a model
  "
  [path change-info]
  (println (u/colorize :magenta :new-change) (u/colorize :magenta path))
  (pprint/pprint change-info))

(defn- clean-change
  [change]
  (dissoc change :updated_at :created_at))

(defn- new-change
  "Add a change to the [[changes]] atom.

    > (new-change :model/Card :insert {:name \"new card\"})
    instance

    > @changes*
    {:report_card {:insert [{:name \"new card\"}]}]}.

  For insert, track the instance as a map.
  For update, only track the changes."
  [model action row-or-instance]
  (let [model       (t2/resolve-model model)
        change-info (->> (case action
                           :update
                           (into {} (t2/changes row-or-instance))
                           (into {} row-or-instance))
                        clean-change)
        path       [(t2/table-name model) action]]
    ;; ideally this should be debug, but for some reasons this doesn't get logged
    (on-change path change-info)
    (swap! changes* update-in path concat [change-info])))

(defn- new-change-thunk
  [model action]
  (fn [_model row]
    (new-change model action row)
    row))

(def ^:private hook+aux-method+action+deriveable
  "A list of toucan hooks that we will subscribed to when tracking a model."
  [;; will be better if we could use after-insert to get the inserted id, but toucan2 doesn't define a multimethod for after-insert
   [#'t2.before-insert/before-insert :after :insert ::t2.before-insert/before-insert]
   [#'t2.before-update/before-update :after :update ::t2.before-update/before-update]
   ;; we do :before aux-method instead of :after for delete bacause the after method has input is number of affected rows
   [#'t2.before-delete/before-delete :before :delete ::t2.before-delete/before-delete]])

(defn- track-one!
  [model]
  (doseq [[hook aux-method action deriveable] hook+aux-method+action+deriveable]
    (when-not (m/primary-method @hook model)
      ;; aux-method will not be triggered if there isn't a primary method
      (t2.util/maybe-derive model deriveable)
      (m/add-primary-method! hook model (fn [_ _model row] row)))
    (m/add-aux-method-with-unique-key! hook aux-method model (new-change-thunk model action) ::tracking)))

(defn track!
  "Start tracking a list of models.

  (track! 'Card 'Dashboard)"
  [& models]
  (doseq [model (map t2.model/resolve-model models)]
    (track-one! model)
    (swap! tracked-models conj model)))

(defn- untrack-one!
  [model]
  (doseq [[hook aux-method _action] hook+aux-method+action+deriveable]
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
  (reset! changes* {}))

(defn untrack-all!
  "Quickly untrack all the tracked models."
  []
  (reset-changes!)
  (apply untrack! @tracked-models)
  (reset! tracked-models #{}))

(defn changes
  "Return all changes that were recorded."
  []
  @changes*)
