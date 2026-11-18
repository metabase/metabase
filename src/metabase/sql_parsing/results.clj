(ns metabase.sql-parsing.results
  "The values [[metabase.sql-parsing.core]] hands its callers, made from what a parser returns. Both parsers return
  the same data with keyword keys in snake case, but Python's errors arrive as lists of key-value pairs.
  [[metabase.sql-parsing.shadow]] compares parsers on the same values."
  (:require
   [clojure.string :as str])
  (:import
   (java.util IdentityHashMap)))

(set! *warn-on-reflection* true)

(defn- convert-field-type
  "Convert field type string (snake_case) to keyword (kebab-case)."
  [type-str]
  (-> type-str
      (str/replace "_" "-")
      keyword))

(defn- convert-error
  "A parser error in the Metabase lib error format. A Python error arrives as a list of key-value pairs."
  [error]
  (let [{err-type :type :as m} (if (sequential? error)
                                 (update-keys (into {} error) keyword)
                                 error)]
    (case err-type
      "syntax_error"        {:type :syntax-error}
      "missing_column"      {:type :missing-column :name (:column m)}
      "missing_table_alias" {:type :missing-table-alias :name (:table m)}
      (if (some? err-type)
        {:type (keyword err-type)}
        error))))

(defn cached-by-identity!
  "The value of `(compute)` for `k`, computed one time for each `k` object and kept in `cache`, an `IdentityHashMap`."
  [^IdentityHashMap cache k compute]
  (if (.containsKey cache k)
    (.get cache k)
    (let [result (compute)]
      (.put cache k result)
      result)))

(defn- convert-table
  "The table of an all-columns field, without its empty keys."
  [{:keys [table schema database table_alias]}]
  (cond-> {}
    table       (assoc :table table)
    schema      (assoc :schema schema)
    database    (assoc :database database)
    table_alias (assoc :table-alias table_alias)))

(defn- convert-field
  "A parser field in the Metabase format. `cache` holds the composite fields converted so far."
  [cache field]
  (when field
    (let [field-type (some-> (:type field) convert-field-type)]
      (case field-type
        :single-column
        {:type           :single-column
         :column         (:column field)
         :alias          (:alias field)
         :source-columns (mapv #(mapv (partial convert-field cache) %) (:source_columns field))}

        :all-columns
        {:type  :all-columns
         :table (convert-table (:table field))}

        :custom-field
        {:type  :custom-field
         :alias (:alias field)}

        :composite-field
        (cached-by-identity!
         cache
         field
         (fn []
           {:type          :composite-field
            :alias         (:alias field)
            :member-fields (mapv (partial convert-field cache) (:member_fields field))}))

        :unknown-columns
        {:type :unknown-columns}

        (assoc field :type field-type)))))

(defn field-references
  "The `field-references` value callers get from a parser's raw `field-references` result: `:used-fields` and
  `:errors` as sets, `:returned-fields` in order."
  [{:keys [used_fields returned_fields errors]}]
  (let [cache (IdentityHashMap.)]
    {:used-fields     (into #{} (map (partial convert-field cache)) used_fields)
     :returned-fields (mapv (partial convert-field cache) returned_fields)
     :errors          (into #{} (map convert-error) errors)}))
