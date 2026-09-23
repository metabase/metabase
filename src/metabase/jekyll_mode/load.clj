(ns metabase.jekyll-mode.load
  (:require
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.jekyll-mode.files :as files]
   [metabase.jekyll-mode.writeback :as writeback]
   [metabase.lib.core :as lib]
   [metabase.queries.schema :as queries.schema]
   [metabase.segments.schema :as segments.schema]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as u.yaml]
   [toucan2.core :as t2]))

(defn- file->instance [model filename]
  (let [instance (or (u.yaml/from-file filename)
                     (throw (ex-info (format "Failed to read file %s" (pr-str filename))
                                     {:model model, :filename filename})))
        schema   (case model
                   :model/Card          ::queries.schema/card
                   :model/DashboardCard ::dashboards.schema/dashboard-card
                   :model/Dashboard     ::dashboards.schema/dashboard
                   :model/Metric        :any ; TODO
                   :model/Segment       ::segments.schema/segment)]
    (lib/normalize schema instance)))

(defn- load-instance! [model instance]
  ;; avoid infinite loop
  (binding [writeback/*suppress-file-updates* true]
    (if (:id instance)
      (do
        (t2/update! model (:id instance) instance)
        (printf "Updated %s %d.\n" model (:id instance)))
      (let [id (t2/insert-returning-pk! model instance)]
        (printf "Inserted new %s %d.\n" model id)))))

(mu/defn load-instance-from-file! [filename :- :string]
  (let [model (files/filename->model filename)]
    (load-instance! model (file->instance model filename))))

(comment
  (load-instance-from-file! "/Users/camsaul/metabase/local/cards/144.yaml")

  (load-instance-from-file! "/Users/camsaul/metabase/local/dashboards/2.yaml")

  (load-instance! :model/Card (-> "/Users/camsaul/metabase/local/cards/144.yaml"
                                  (->> (file->instance :model/Card))
                                  (dissoc :id :entity_id)))

  (load-instance! :model/Dashboard (-> "/Users/camsaul/metabase/local/dashboards/2.yaml"
                                       (->> (file->instance :model/Card))
                                       (dissoc :id :entity_id))))
