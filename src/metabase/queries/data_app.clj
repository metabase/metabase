(ns metabase.queries.data-app
  "The tables a query reads and the names of the cards it uses, as the rule that holds data apps to the Library checks
  and reports them."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.db :as queries.db]))

(set! *warn-on-reflection* true)

(defn card-labels
  "A comma-separated list of the cards with `card-ids`, by name and ID, sorted by ID, for an error message."
  [metadata-providerable card-ids]
  (str/join ", " (for [{card-name :name, card-id :id} (sort-by :id (lib.metadata/bulk-metadata metadata-providerable :metadata/card card-ids))]
                   (format "\"%s\" (%d)" card-name card-id))))

(defn- direct-table-ids
  "The IDs of the tables `query` reads directly: its source tables, explicit joins included, and the tables it reaches
  through a foreign key."
  [query]
  (set/union (set (lib/all-source-table-ids query))
             (set (lib/all-implicitly-joined-table-ids query))))

(defn- macro-table-ids
  "The IDs of the tables that the definitions of the segments and measures `query` uses read, through the segments and
  measures those definitions use too, skipping the segments and measures in `seen`."
  [query seen]
  (let [macros (into []
                     (remove (comp seen (juxt :lib/type :id)))
                     (concat (some->> (lib/all-segment-ids query) (lib.metadata/bulk-metadata query :metadata/segment))
                             (some->> (lib/all-measure-ids query) (lib.metadata/bulk-metadata query :metadata/measure))))
        seen   (into seen (map (juxt :lib/type :id)) macros)]
    (into #{}
          (comp (keep :definition)
                (filter (comp seq :stages))
                (mapcat #(let [definition (lib/query query %)]
                           (set/union (direct-table-ids definition) (macro-table-ids definition seen)))))
          macros)))

(defn- remapped-table-ids
  "The IDs of the tables whose columns replace a column `query` returns, through a foreign key remapping."
  [query]
  (into #{}
        (keep :table-id)
        (some->> (lib/returned-columns query)
                 (keep (comp :field-id :lib/external-remap))
                 not-empty
                 (lib.metadata/bulk-metadata query :metadata/column))))

(defn read-table-ids
  "The IDs of the tables `query` reads, directly, through its segments and measures at any depth, and through its
  remapped columns."
  [query]
  (set/union (direct-table-ids query)
             (macro-table-ids query #{})
             (remapped-table-ids query)))

(defn unpublished-read-table-names
  "The names of the tables `query` reads that aren't published to the Library, or nil when it reads none."
  [query]
  (some-> (not-empty (read-table-ids query)) queries.db/unpublished-table-names not-empty))
