(ns metabase.jekyll-mode.writeback
  (:require
   [metabase.jekyll-mode.files :as files]
   [metabase.jekyll-mode.writeback.serialize :as serialize]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.after]))

;;; TODO -- move model-related stuff into separate `.models.writeback` namespace

(def ^:dynamic *suppress-writeback*
  "Block writeback when we know the write is coming from the filesystem watcher."
  false)

(doseq [model [:model/Card
               :model/Dashboard
               :model/DashboardCard
               :model/Metric
               :model/Segment]]
  (derive model ::writeback))

(def ^:dynamic *suppress-file-updates* false)

(mu/defn- update-file!
  [{:keys [id], :as instance} :- [:map
                                  [:id pos-int?]]]
  (when-not *suppress-file-updates*
    (files/create-model-directory-if-not-exists! (t2/model instance))
    (let [filename (files/instance-filename instance)]
      (spit filename (serialize/serialize instance))
      (printf "Wrote %s %d to %s.\n" (t2/model instance) id filename))))

(t2/define-after-update ::writeback
  [instance]
  (update-file! instance))

(methodical/prefer-method!
 #'toucan2.tools.after/each-row-fn
 [:toucan.query-type/update.* ::writeback]
 [:toucan.query-type/update.* :hook/search-index])

(comment
  *e
  (defn- %update! []
    (-> (t2/select-one :model/Dashboard :id 2)
        (update :name str "_2")
        t2/save!)))

(t2/define-after-insert ::writeback
  [instance]
  (update-file! instance))

(comment

  (t2/select-pk->fn :name :model/Card)
  (t2/update! :model/Card 23 {:name "MOST RECENT SUBSCRIPTION"})
  (defn- %insert! []
    (t2/insert! :model/Card (-> (t2/select-one :model/Card)
                                (dissoc :id :entity_id)))))

(methodical/prefer-method!
 #'toucan2.tools.after/each-row-fn
 [:toucan.query-type/insert.* :hook/search-index]
 [:toucan.query-type/insert.* ::writeback])

;; TODO -- implement delete?
