(ns metabase.jekyll-mode.writeback
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.jekyll-mode.files :as files]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as u.yaml]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.after])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

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

(defn- yaml-file? [^File f]
  (and (.isFile f)
       (str/ends-with? (.getName f) ".yaml")))

(defn- file-entity-id
  "Returns the `entity_id` of a serdes-exported yaml file, or nil if it doesn't have one (e.g. settings.yaml)."
  [^File f]
  (:entity_id (u.yaml/from-file f)))

(defn- entity-id-files
  "All yaml files under `root-dir` whose `entity_id` matches `entity-id`."
  [root-dir entity-id]
  (into []
        (comp (filter yaml-file?)
              (filter #(= entity-id (file-entity-id %))))
        (file-seq (io/file root-dir))))

(defn- prune-stale-exports!
  "Deletes old exported files left behind when an entity's slug-derived filename changes (e.g. a Card is
  renamed and gets a new filename). There should only ever be one file per `entity_id`; the most recently
  written one is kept, since we just wrote it."
  [root-dir entity-id]
  (let [files (entity-id-files root-dir entity-id)]
    (when (> (count files) 1)
      (let [newest (apply max-key #(.lastModified ^File %) files)]
        (doseq [^File f files
                :when (not= f newest)]
          (io/delete-file f true)
          (log/infof "Deleted stale jekyll export file %s (entity_id %s)" (str f) entity-id))))))

(mu/defn- update-file!
  [{:keys [id], entity-id :entity_id, :as instance} :- [:map
                                                        [:id pos-int?]]]
  (when-not *suppress-file-updates*
    (let [model    (t2/model instance)
          root-dir (files/directory-prefix)]
      ;; Never let an export failure escape. This runs from an after-update/after-insert hook, inside the
      ;; transaction doing the write, so throwing here rolls the user's edit back -- renaming a card whose
      ;; references serialization can't satisfy would silently fail in the UI. Writing files is a
      ;; side-channel; the app-db write is what matters, so a broken export is logged and dropped.
      (try
        (serdes/with-cache
          (let [entity-stream (serialization/extract {:targets [[(name model) id]]
                                                      :no-data-model true
                                                      :no-settings true
                                                      :no-transforms true})
                writer        (serialization/file-writer root-dir)]
            (serialization/store! entity-stream writer)))
        (when entity-id
          (prune-stale-exports! root-dir entity-id))
        (printf "Wrote %s %d to %s.\n" (t2/model instance) id root-dir)
        (catch Exception e
          (log/errorf e "Error writing %s %d to %s; app-db write is unaffected" model id root-dir))))))

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
