(ns metabase.sql-parsing.results
  "The values [[metabase.sql-parsing.core]] hands its callers, made from what a parser returns. Both parsers return
  the same data in slightly different shapes (Python's frozensets arrive as pair vectors, keys in snake case); these
  functions read either shape. [[metabase.sql-parsing.shadow]] compares parsers on the same values."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- convert-field-type
  "Convert field type string (snake_case) to keyword (kebab-case)."
  [type-str]
  (-> type-str
      (str/replace "_" "-")
      keyword))

(defn- convert-error
  "Convert Python error format to Metabase lib error format."
  [error]
  (let [;; Get type from various possible key formats
        err-type (or (:type error) (get error "type"))
        ;; Get name/table/column from various possible formats
        table-name (or (:table error) (get error "table"))
        column-name (or (:column error) (get error "column") (:name error) (get error "name"))]
    (cond
      ;; Python frozenset came through as vector of pairs: [["type" "syntax_error"]]
      (and (sequential? error) (sequential? (first error)))
      (let [m (into {} error)
            err-type (get m "type")]
        (case err-type
          "syntax_error" {:type :syntax-error}
          "missing_column" {:type :missing-column :name (get m "column")}
          "missing_table_alias" {:type :missing-table-alias :name (get m "table")}
          {:type (keyword err-type)}))

      ;; Handle string or keyword types
      (or (string? err-type) (keyword? err-type))
      (case (if (keyword? err-type) (name err-type) err-type)
        ("syntax-error" "syntax_error") {:type :syntax-error}
        ("missing-column" "missing_column") {:type :missing-column :name column-name}
        ("missing-table-alias" "missing_table_alias") {:type :missing-table-alias :name table-name}
        {:type (keyword err-type)})

      :else error)))

(defn- convert-field
  "Convert a field spec from Python format to Clojure format."
  [field]
  (when field
    (let [field-type (some-> (or (:type field) (get field "type")) convert-field-type)]
      (case field-type
        :single-column
        {:type :single-column
         :column (or (:column field) (get field "column"))
         :alias (or (:alias field) (get field "alias"))
         :source-columns (mapv (fn [scope]
                                 (mapv convert-field scope))
                               (or (:source-columns field)
                                   (:source_columns field)
                                   (get field "source_columns")
                                   []))}

        :all-columns
        {:type :all-columns
         :table (let [t (or (:table field) (get field "table"))]
                  (cond-> {}
                    (or (:table t) (get t "table"))
                    (assoc :table (or (:table t) (get t "table")))
                    (or (:schema t) (get t "schema"))
                    (assoc :schema (or (:schema t) (get t "schema")))
                    (or (:database t) (get t "database"))
                    (assoc :database (or (:database t) (get t "database")))
                    (or (:table-alias t) (:table_alias t) (get t "table_alias"))
                    (assoc :table-alias (or (:table-alias t) (:table_alias t) (get t "table_alias")))))}

        :custom-field
        {:type :custom-field
         :alias (or (:alias field) (get field "alias"))
         :used-fields (set (map convert-field
                                (or (:used-fields field)
                                    (:used_fields field)
                                    (get field "used_fields")
                                    [])))}

        :composite-field
        {:type :composite-field
         :alias (or (:alias field) (get field "alias"))
         :member-fields (mapv convert-field
                              (or (:member-fields field)
                                  (:member_fields field)
                                  (get field "member_fields")
                                  []))}

        :unknown-columns
        {:type :unknown-columns}

        ;; Fallback - return as-is with type conversion
        (assoc field :type field-type)))))

(defn field-references
  "The `field-references` value callers get from a parser's raw `field-references` result: `:used-fields` and
  `:errors` as sets, `:returned-fields` in order."
  [raw]
  (let [used-fields     (or (:used-fields raw) (:used_fields raw) (get raw "used_fields") [])
        returned-fields (or (:returned-fields raw) (:returned_fields raw) (get raw "returned_fields") [])
        errors          (or (:errors raw) (get raw "errors") [])]
    {:used-fields     (set (map convert-field used-fields))
     :returned-fields (vec (map convert-field returned-fields))
     :errors          (set (map convert-error errors))}))
