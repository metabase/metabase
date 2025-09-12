(ns metabase.lib.util.log
  "EXPERIMENTAL helper functions for logging stuff. Very important when I spend all day
  debugging [[metabase.lib.field.resolution]] -- Cam"
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]))

(defn- table-name
  [metadata-providerable x]
  (cond
    (= (:lib/type x) :metadata/table) (:name x)
    (pos-int? x)                      (recur metadata-providerable (lib.metadata/table metadata-providerable x))))

(defn format-table
  "Render a Table metadata or ID in a nice way e.g.

    Table 100 \"ORDERS\""
  [metadata-providerable x]
  (cond
    (= (:lib/type x) :metadata/table) (lib.util/format "Table %d %s" (:id x) (pr-str (:name x)))
    (pos-int? x)                      (recur metadata-providerable (lib.metadata/table metadata-providerable x))
    :else                             (lib.util/format "Table %s" (pr-str x))))

(defn format-field
  "Render a Column metadata or Field ID in a nice way e.g.

    Field 200 \"ORDERS\".\"CREATED_AT\""
  [metadata-providerable x]
  (cond
    (= (:lib/type x) :metadata/column) (str "Field "
                                            (when (:id x)
                                              (str (:id x) " "))
                                            (when (:table-id x)
                                              (str (pr-str (table-name metadata-providerable (:table-id x))) "."))
                                            (pr-str ((some-fn :lib/source-column-alias :name) x)))
    (pos-int? x)                      (recur metadata-providerable (lib.metadata/field metadata-providerable x))
    :else                             (lib.util/format "Field %s" (pr-str x))))
