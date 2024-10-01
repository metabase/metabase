(ns metabase.query-analysis.native-query-analyzer.parameter-substitution
  "Replace {{variable}}s and {{field filters}} in SQL queries with parse-able equivalents.")

(def default-values
  "Map of default values for each type"
  {;; Normal variables
   :date                    "2024-01-09"
   :number                  "1"
   :text                    "sample text"
   ;; Potentially deprecated
   :boolean                 "true"
   :id                      "1"
   :category                "sample category"
   :date/single             "2024-01-09"
   ;; Card ref: doesn't matter
   :card                    nil
   ;; Field filters
   :date/range              "2023-01-09~2024-01-09"
   :date/month-year         "2024-01"
   :date/quarter-year       "Q1-2024"
   :date/relative           "past1years"
   :date/all-options        "2024-01"
   :number/!=               ["1"]
   :number/<=               ["1"]
   :number/=                ["1"]
   :number/>=               ["1"]
   :number/between          ["1" "2"]
   :string/!=               ["sample text"]
   :string/=                ["sample text"]
   :string/contains         ["sample text"]
   :string/does-not-contain ["sample text"]
   :string/ends-with        ["sample text"]
   :string/starts-with      ["sample text"]
   ;; Potentially deprecated
   :location/city           ["Moon Twp"]
   :location/state          ["PA"]
   :location/zip_code       ["15108"]
   :location/country        ["USA"]})

(defn- type->value
  [t]
  (default-values t))

(defn- tag-default
  [{:keys [default type widget-type] :as tag}]
  (assoc tag :default
         (or default
             (if (= type :dimension)
               (type->value widget-type)
               (type->value type)))))

(defn replace-tags
  "Given a native dataset_query, return a `{:query \"<SQL string>\"}` where the SQL no longer has Metabase-specific
  template tags."
  [query]
  (if-let [name->tag (seq (get-in query [:native :template-tags]))]
    ((requiring-resolve 'qp.compile/compile)
     (assoc-in query [:native :template-tags] (update-vals name->tag tag-default)))
    (:native query)))
