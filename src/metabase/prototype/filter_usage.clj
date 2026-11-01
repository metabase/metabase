(ns metabase.prototype.filter-usage
  "Which columns saved questions often filter on. Prototype for the \"Frequently used\" section of the filter
  picker."
  (:require
   [metabase.prototype.db :as prototype.db]
   [metabase.util.json :as json]))

(defn- field-ref-id
  "The field id of a field ref in MBQL 5 (`[\"field\" opts id]`) or legacy (`[\"field\" id opts]`) form."
  [x]
  (when (and (sequential? x) (= "field" (first x)))
    (some #(when (int? %) %) (rest x))))

(defn- collect [pred x]
  (keep pred (tree-seq coll? seq x)))

(defn- query-usage
  "The source table ids and the filtered field ids of the parsed `query`, in any MBQL version."
  [query]
  (let [nodes (tree-seq coll? seq query)]
    {:table-ids (into #{} (keep #(when (map? %) (let [t (get % "source-table")] (when (int? t) t)))) nodes)
     :field-ids (into #{}
                      (comp (filter map?)
                            (mapcat #(concat (get % "filters") (when-let [f (get % "filter")] [f])))
                            (mapcat #(collect field-ref-id %)))
                      nodes)}))

(defn filter-usage
  "The columns that saved questions filter on, most often first.

  For each column, `ratio` is the number of questions that filter on it, divided by the number of questions that
  use its table. A question uses a table when the table is its source table, a joined table, or the table of a
  column that it filters on (for example through an implicit join)."
  []
  (let [usages        (into [] (keep (fn [s]
                                       (try (query-usage (json/decode s))
                                            (catch Exception _ nil))))
                            (prototype.db/saved-query-dataset-queries))
        field->table  (prototype.db/field-id->table-id (into #{} (mapcat :field-ids) usages))
        usages        (map (fn [{:keys [field-ids] :as usage}]
                             (update usage :table-ids into (keep field->table) field-ids))
                           usages)
        table-counts  (frequencies (mapcat :table-ids usages))
        field-counts  (frequencies (mapcat :field-ids usages))]
    (->> field-counts
         (keep (fn [[field-id n]]
                 (let [table-id (field->table field-id)]
                   (when table-id
                     (let [total (get table-counts table-id 0)]
                       {:field_id     field-id
                        :table_id     table-id
                        :filter_count n
                        :query_count  total
                        :ratio        (if (pos? total) (double (/ n total)) 0.0)})))))
         (sort-by (juxt (comp - :ratio) (comp - :filter_count)))
         vec)))
