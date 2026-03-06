(ns metabase.sample-content.import
  "Imports sample content (dashboards, questions, collections) on fresh installs.
  Called after the sample database has been extracted and synced, so all table/field
  references can be resolved via serdes portable IDs."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- load-edn [file-name]
  (with-open [r (io/reader (io/resource file-name))]
    (edn/read {:readers {'t u.date/parse}} (java.io.PushbackReader. r))))

(defn- import-entity! [entity]
  (let [local (serdes/load-find-local (serdes/path entity))]
    (serdes/load-one! entity local)))

(defn- backfill-document-ids!
  "After Cards and Documents are both imported, set document_id on Cards that had one."
  [cards]
  (doseq [{:keys [entity_id document_id]} cards
          :when document_id]
    (let [card-id (:id (serdes/lookup-by-id :model/Card entity_id))
          doc-id  (:id (serdes/lookup-by-id :model/Document document_id))]
      (when (and card-id doc-id)
        (t2/update! :model/Card card-id {:document_id doc-id})))))

(defn- set-example-dashboard-id!
  "Look up the imported dashboard by entity_id and store its numeric ID in the setting table."
  [dashboards]
  (when-let [entity-id (-> dashboards first :entity_id)]
    (when-let [dash (t2/select-one :model/Dashboard :entity_id entity-id)]
      (t2/query {:insert-into :setting
                 :values      [{:key "example-dashboard-id" :value (str (:id dash))}]})
      ;; need to manually kick the cache here. We can't use `setting/set!` because the setting is read only, but the
      ;; manual insert doesn't kick the cache.
      (setting/restore-cache!))))

(defn- should-import? []
  (and
   ;; import if:
   ;; config doesn't say not to
   (config/load-sample-content?)
   ;; this is set by E2E tests. Skip it then to speed things up
   ;; TODO: e2e tests should use `MB_LOAD_SAMPLE_CONTENT=false` instead of this being an unexpected side effect of
   ;; setting a separate env var.
   (not (config/config-bool :mb-enable-test-endpoints))
   ;; the sample database should have been created already
   (t2/exists? :model/Database :is_sample true)
   ;; we didn't do this already!
   (nil? (setting/get-value-of-type :integer :example-dashboard-id))))

(defn- do-import! []
  (log/info "Loading sample content...")
  (let [data (load-edn "sample-content.edn")]
    (binding [mi/*deserializing?* true]
      (doseq [coll (:collections data)]
        (import-entity! coll))
      ;; Card↔Document circular dependency: Cards have document_id FK, Documents
      ;; reference Cards in content. Break the cycle by importing Cards first with
      ;; document_id stripped, then Documents (which can now resolve card refs),
      ;; then backfill document_id on Cards.
      (doseq [card (:cards data)]
        (import-entity! (dissoc card :document_id)))
      (doseq [doc (:documents data)]
        (import-entity! doc))
      (backfill-document-ids! (:cards data))
      (doseq [dash (:dashboards data)]
        (import-entity! dash)))
    (set-example-dashboard-id! (:dashboards data))
    (log/info "Sample content loaded successfully.")))

(defn import!
  "Import sample content (collections, cards, dashboards) from the portable EDN resource.
  Only runs on fresh installs where the sample database has already been synced."
  []
  (when (should-import?)
    (try
      (t2/with-transaction [_tx] (do-import!))
      (catch Throwable e
        (log/error e "Failed to load sample content")))))
