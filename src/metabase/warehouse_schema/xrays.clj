(ns metabase.warehouse-schema.xrays
  "The x-rays of Tables and Fields."
  (:require
   [metabase.xrays.related :as xrays.related]))

(set! *warn-on-reflection* true)

(defn table-related
  "The related entities of `table`."
  [table]
  (let [linking-to  (xrays.related/linking-to table)
        linked-from (xrays.related/linked-from table)]
    {:segments    (xrays.related/segments-for-table table)
     :metrics     (xrays.related/metrics-for-table table)
     :linking-to  linking-to
     :linked-from linked-from
     :tables      (->> (xrays.related/sibling-tables table)
                       (remove (set (concat linking-to linked-from)))
                       xrays.related/filter-visible
                       xrays.related/interesting-mix)}))

(defn field-definition
  "The reference to `field`, which is all that the definition of a Field is."
  [field]
  [[:field {:lib/uuid (str (random-uuid))} (:id field)]])

(defn field-related
  "The related entities of `field`."
  [field]
  (let [table (xrays.related/table-of field)]
    {:table    table
     :segments (->> table
                    xrays.related/segments-for-table
                    (xrays.related/rank-by-similarity field)
                    xrays.related/interesting-mix)
     :metrics  (->> table
                    xrays.related/metrics-for-table
                    (xrays.related/rank-by-similarity field)
                    (filter (comp pos? :similarity))
                    xrays.related/interesting-mix)
     :fields   (->> (xrays.related/fields-beside table field)
                    xrays.related/filter-visible
                    xrays.related/interesting-mix)}))
