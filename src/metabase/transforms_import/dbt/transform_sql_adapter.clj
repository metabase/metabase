(ns metabase.transforms-import.dbt.transform-sql-adapter
  "Adapt dbt-compiled SQL for Metabase Transforms."
  (:require
    [clojure.string :as str]))

(defn- remap-schemas [sql schema-remap]
  "Replace dbt schema references with transform schema references."
  (if (empty? schema-remap)
    sql
    (reduce (fn [sql [old-schema new-schema]]
              (if (= old-schema new-schema)
                sql
                (let [quoted-pattern (re-pattern (str "(?:^|[\\s,(])\"" old-schema "\"\\."))
                      unquoted-pattern (re-pattern (str "(?:^|[^\\w\"])" old-schema "\\.(?=[\\w\"])"))]
                  (-> sql
                      (str/replace quoted-pattern (str "\"" new-schema "\"."))
                      (str/replace unquoted-pattern (str new-schema "."))))))
            sql
            schema-remap)))

(defn- resolve-transform-schema
  "Resolve the transform schema for a model."
  [model schema-remap default-schema transform-schema-prefix]
  (if (get-in model [:config :is_seed])
    (or (:schema-name model) "seeds")
    (let [original-schema (or (:schema-name model) default-schema)]
      (if (contains? schema-remap original-schema)
        (get schema-remap original-schema)
        (str transform-schema-prefix original-schema)))))

(defn- clean-whitespace [sql]
  "Collapse blank lines for readability."
  (let [lines (str/split-lines sql)
        cleaned (reduce (fn [[result prev-blank] line]
                         (let [is-blank (str/blank? line)]
                           (if (and is-blank prev-blank)
                             [result true]
                             [(conj result line) is-blank])))
                       [[] false]
                       lines)]
    (str/join "\n" (first cleaned))))

(defn adapt [model schema-remap default-schema transform-schema-prefix]
  "Adapt a model's compiled SQL for Metabase transforms."
  (let [sql (:compiled-sql model)
        warnings (atom [])]
    (if (or (nil? sql) (str/blank? sql))
      (let [schema (resolve-transform-schema model schema-remap default-schema transform-schema-prefix)
            table (or (:alias model) (:name model))
            passthrough-sql (str "SELECT * FROM " schema "." table)]
        (swap! warnings conj (str "No compiled SQL available for '" (:name model) "'; using passthrough query"))
        [passthrough-sql @warnings])
      (let [remapped-sql (remap-schemas sql schema-remap)
            cleaned-sql (clean-whitespace remapped-sql)]
        [cleaned-sql @warnings]))))
