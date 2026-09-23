(ns metabase.jekyll-mode.load
  (:require
   [metabase.jekyll-mode.writeback :as writeback]
   [metabase.lib.core :as lib]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.yaml :as u.yaml]
   [toucan2.core :as t2]))

(defn- file->instance [model filename]
  (let [instance (or (u.yaml/from-file filename)
                     (throw (ex-info (format "Failed to read file %s" (pr-str filename))
                                     {:model model, :filename filename})))
        schema   (case model
                   :model/Card ::queries.schema/card)]
    (lib/normalize schema instance)))

(defn- load-instance! [model instance]
  ;; avoid infinite loop
  (binding [writeback/*suppress-file-updates* true]
    (let [schema   (case model
                     :model/Card ::queries.schema/card)
          instance (lib/normalize schema instance)]
      (if (:id instance)
        (do
          (t2/update! model (:id instance) instance)
          (printf "Updated %s %d.\n" model (:id instance)))
        (let [id (t2/insert-returning-pk! model instance)]
          (printf "Inserted new %s %d.\n" model id))))))

(defn- load-instance-from-file! [model filename]
  (load-instance! model (file->instance model filename)))

(comment
  (defn- %read-file-for-update! []
    (load-instance-from-file! :model/Card "/Users/camsaul/metabase/local/cards/144.yaml"))

  (defn- %read-file-for-insert! []
    (load-instance! :model/Card (-> "/Users/camsaul/metabase/local/cards/144.yaml"
                                    (->> (file->instance :model/Card))
                                    (dissoc :id :entity_id)))))
