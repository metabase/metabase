(ns dev.db-tracking
  "A set of utility function to track database changes.
  Use this when you want to observe changes of database models when doing stuffs on UI.
  How to use this?
  > (track! models/Dashboard models/Card models/DashboardCard)
  -- Go on UI and do stuffs like (i.e: update viz-settings of a dashcard).
  > (changes)
  ;; => {:update {:report_dashboardcard ...}}
  You can use [[reset-tracking!]] to clear our all the current trackings.
  And [[untrack-all!]] or [[untrack!]] to stop tracking."
  (:require
   [clojure.pprint :as pprint]
   [metabase.util :as u]
   [methodical.core :as m]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.tools.before-update :as t2.before-update]))

(def ^:private tracking (atom {}))

(def ^:private tracked-models (atom []))

(defn- clean-tracking
  [tracking]
  (dissoc tracking :updated_at :created_at))

(defn new-tracking
  "Add a tracking to the [[tracking]] atom.
    > (new-tracking :insert (t2/instance :models/Card {:name \"new card\"}))
    instance
    > @tracking
    {:insert {:report_card [{:name \"new card\"}]}]}.
  For insert, track the instance as a map.
  For update, only track the changes."
  [action instance]
  (let [track-item (->> (case action
                          :insert
                          (into {} instance)
                          :update
                          (into {} (t2/changes instance)))
                       clean-tracking)
        path       [(t2/table-name instance) action]]
    ;; ideally this should be debug, but for some reasons this doesn't get logged
    (println (u/colorize 'green :new-tracking) path)
    (pprint/pprint track-item)
    (swap! tracking update-in path conj track-item)))

(t2/define-after-insert ::tracking
  [instance]
  (new-tracking :insert instance)
  instance)

;; TODO: we use before-update but not after-update because `t2/changes` on instance returns empty map on after-update
(t2/define-before-update ::tracking
  [instance]
  (new-tracking :update instance)
  instance)

(m/prefer-method! #'toucan2.tools.before-update/before-update
                                :metabase.models.interface/timestamped?
                                ::tracking)

;; define-after-delete haven't supported https://github.com/camsaul/toucan2/issues/70
#_(t2/define-after-delete ::tracking
    [instance]
    (new-tracking :delete instance)
    instance)

(defn reset-tracking!
  "Reset all trackings."
  []
  (reset! tracking {}))

(defn track!
  "Start tracking a list of models."
  [& models]
  (doseq [model (map t2.model/resolve-model models)]
    (swap! tracked-models conj model)
    (derive model ::tracking)))

(defn untrack!
  "Remove tracking for a list of models."
  [& models]
  (doseq [model (map t2.model/resolve-model models)]
    (underive model ::tracking)))

(defn untrack-all!
  "Quickly untrack all the tracked models."
  []
  (apply untrack! @tracked-models)
  (reset! tracked-models []))

(defn changes
  "Return all changes that were recorded."
  []
  @tracking)

(comment
  (require '[metabase.models :as models])
  (track! models/Dashboard models/Card models/DashboardCard)

  (reset-tracking!)

  (untrack! models/Dashboard models/Card models/DashboardCard))
