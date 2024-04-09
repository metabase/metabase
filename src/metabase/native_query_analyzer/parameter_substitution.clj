(ns metabase.native-query-analyzer.parameter-substitution
  "Replace {{variable}}s and {{field filters}} in SQL queries with parse-able equivalents."
  (:require
   [metabase.query-processor.compile :as qp.compile]))

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
   :location/zip_code       ["15143"]
   :location/country        ["USA"]})

(defn- type->value
  [t]
  (default-values t))

(defn- field-filter->parameter
  [{:keys [name id widget-type default]}]
  {:value  (or default
               (type->value widget-type))
   :id     id
   :type   widget-type
   :target [:dimension [:template-tag name]]})

(defn- template-tag->parameter
  [{:keys [type name id default] :as tag}]
  (if (= type :dimension)
    (field-filter->parameter tag)
    {:value  (or default
                 (type->value type))
     :id     id
     :type   type
     :target [:variable [:template-tag name]]}))

(defn- template-tags->parameters
  [name->tag]
  (map template-tag->parameter (vals name->tag)))

(defn replace-tags
  "Given a native dataset_query, return a `{:query \"<SQL string>\"}` where the SQL no longer has Metabase-specific
  template tags."
  [query]
  (if-let [tags (seq (get-in query [:native :template-tags]))]
    (->> tags
         (template-tags->parameters)
         (assoc query :parameters)
         (qp.compile/compile))
    (:native query)))
