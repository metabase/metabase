(ns metabase.source-swap.native
  "Coordinate native source swaps after resolving the metadata each conversion needs."
  (:require
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.parameters.parse :as lib.params.parse]
   [metabase.lib.util :as lib.util]
   [metabase.source-swap.sql :as source-swap.sql]
   [metabase.source-swap.tags :as source-swap.tags]))

(defn- table-spec
  [{:keys [name schema]}]
  (cond-> {:table name} schema (assoc :schema schema)))

(defn- with-sql-and-tags
  [query sql tags]
  ;; Install converted tags before extraction, so a table→card rename cannot retain table-only attributes.
  (-> query
      (lib.util/update-query-stage 0 assoc :template-tags (vec tags))
      (lib/with-native-query sql)
      (lib/with-template-tags (vec tags))))

(defn- swap-table->table
  [query driver old-table new-table]
  (with-sql-and-tags
    query
    (source-swap.sql/replace-table driver (lib/raw-native-query query) (table-spec old-table) (table-spec new-table))
    (source-swap.tags/remap-dimensions
     query
     (source-swap.tags/table->table (lib/template-tags query) (:id old-table) (:id new-table))
     (:id old-table) (:id new-table))))

(defn- swap-table->card
  [query driver old-table new-card]
  (let [new-tag (source-swap.tags/card-tag (:id new-card) (:name new-card))
        sql     (source-swap.sql/replace-table driver (lib/raw-native-query query) (table-spec old-table)
                                               (source-swap.sql/template-ref (:name new-tag)))
        {:keys [sql template-tags]} (source-swap.tags/table->card
                                     sql (lib/template-tags query) (:id old-table) (:id new-card) (:name new-card))]
    (with-sql-and-tags query sql template-tags)))

(defn- swap-card->table
  [query driver old-card-id {:keys [name schema]}]
  (let [table-ref (if schema (sql.u/quote-name driver :table schema name) (sql.u/quote-name driver :table name))]
    ;; Re-extraction drops the removed card tag and retains the remaining tags.
    (lib/with-native-query query (source-swap.tags/render-card->table
                                  (lib.params.parse/parse (lib/raw-native-query query)) old-card-id table-ref))))

(defn- swap-card->card
  [query old-card-id new-card]
  (with-sql-and-tags
    query
    (source-swap.tags/render-card->card (lib.params.parse/parse (lib/raw-native-query query))
                                        old-card-id (:id new-card) (:name new-card))
    (source-swap.tags/card->card (lib/template-tags query) old-card-id (:id new-card) (:name new-card))))

(defn swap-source-in-native-stages
  "Swap table or card sources in native SQL and template tags. Return the query unchanged if metadata is missing."
  [query [old-type old-id] [new-type new-id]]
  (if-not (and (#{:table :card} old-type) (#{:table :card} new-type))
    query
    (let [conversion [old-type new-type]
          database   (when-not (= conversion [:card :card]) (lib.metadata/database query))
          old-table  (when (= old-type :table) (lib.metadata/table query old-id))
          new-source (case new-type
                       :table (lib.metadata/table query new-id)
                       :card  (lib.metadata/card query new-id))]
      (if (and new-source
               (or (= conversion [:card :card]) database)
               (or (not= old-type :table) old-table))
        (case conversion
          [:table :table] (swap-table->table query (:engine database) old-table new-source)
          [:table :card]  (swap-table->card query (:engine database) old-table new-source)
          [:card :table]  (swap-card->table query (:engine database) old-id new-source)
          [:card :card]   (swap-card->card query old-id new-source))
        query))))
