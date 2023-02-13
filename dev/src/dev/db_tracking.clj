(ns dev.db-tracking
  "A set of utility function so track the database changes after a certiain actions."
  (:require
   [metabase.models :as models]
   [toucan2.core :as t2]))

(def ^:private tracking (atom {}))

(defn new-tracking
  "Add a tracking to the [[tracking]] atom.
    > (new-tracking :insert (t2/instance :models/Card {:name \"new card\"}))
    instance

    > @tracking
    {:insert {:report_card [{:name \"new card\"}]}]}.

  For insert, track the instance as a map.
  For update, only track the changes."
  [action instance]
  (swap! tracking update-in [action (t2/table-name instance)] conj
         (case action
           :insert
           (into {} instance)
           :update
           (into {} (t2/changes instance)))))

(t2/define-after-insert ::tracking
  [instance]
  (new-tracking :insert instance)
  instance)

(t2/define-after-update ::tracking
  [instance]
  (new-tracking :update instance)
  instance)

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
  (doseq [model models]
    (derive model ::tracking)))

(defn untrack!
  "Remove tracking for a list of models."
  [& models]
  (doseq [model models]
    (underive model ::tracking)))

(defn changes
  "Return all changes that were recorded."
  []
  @tracking)

(comment
  (track! models/Dashboard models/Card models/DashboardCard)

  (reset-tracking!)

  (untrack! models/Dashboard models/Card models/DashboardCard))
