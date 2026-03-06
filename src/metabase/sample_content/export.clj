(ns metabase.sample-content.export
  "Dev-time REPL tool for regenerating `resources/sample-content.edn` in a portable
  serdes format. Run against a fresh instance that has the sample dashboard set up.

  Usage from the REPL:
    (metabase.sample-content.export/export!)"
  (:require
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- pretty-spit [file-name data]
  (with-open [writer (io/writer file-name)]
    (binding [*out* writer]
      #_{:clj-kondo/ignore [:discouraged-var]}
      (pprint/pprint data))))

(defn- extract-collections
  "Extract all sample collections (non-trash, non-personal, non-analytics) as portable serdes maps."
  []
  (->> (t2/select :model/Collection
                  {:where [:and
                           [:= :namespace nil]
                           [:= :personal_owner_id nil]
                           [:= :is_sample true]
                           [:= :archived false]]})
       (sort-by :id)
       (mapv #(serdes/extract-one "Collection" {} %))))

(defn- extract-documents
  "Extract all sample documents as portable serdes maps, dependency-ordered."
  [collection-ids]
  (->> (serdes/extract-all "Document" {:where [:in :collection_id collection-ids]})
       (into [])
       (sort-by #(-> % :serdes/meta last :id))
       vec))

(defn- extract-cards
  "Extract all cards in sample collections as portable serdes maps, dependency-ordered."
  [collection-ids]
  (let [cards (t2/select :model/Card {:where [:in :collection_id collection-ids]
                                      :order-by [[:id :asc]]})]
    ;; Sort so cards without source_card_id come first (dependency order).
    (->> cards
         (sort-by (fn [c] [(if (:source_card_id c) 1 0) (:id c)]))
         (mapv #(serdes/extract-one "Card" {} %))
         (mapv #(dissoc % :result_metadata)))))

(defn- extract-dashboards
  "Extract all dashboards in sample collections as portable serdes maps.
  Uses `extract-all` to pick up nested tabs, dashcards, and series with full FK transformation."
  [collection-ids]
  (->> (serdes/extract-all "Dashboard" {:where [:in :collection_id collection-ids]})
       (into [])
       (sort-by #(-> % :serdes/meta last :id))
       vec))

(defn export!
  "Export sample content from the current instance to `resources/sample-content.edn`.
  Run this against a fresh instance with the sample dashboard set up."
  ([]
   (export! "resources/sample-content.edn"))
  ([output-path]
   (let [sample-db      (t2/select-one :model/Database :is_sample true)
         _              (assert sample-db "No sample database found. Start a fresh instance first.")
         collections    (extract-collections)
         collection-ids (set (map :id (t2/select :model/Collection :is_sample true)))
         cards          (extract-cards collection-ids)
         dashboards     (extract-dashboards collection-ids)
         documents      (extract-documents collection-ids)
         data           {:collections collections
                         :cards       cards
                         :dashboards  dashboards
                         :documents   documents}]
     (pretty-spit output-path data)
     (log/infof "Exported %d collections, %d cards, %d dashboards, %d documents to %s"
                (count collections) (count cards) (count dashboards) (count documents)
                output-path))))
