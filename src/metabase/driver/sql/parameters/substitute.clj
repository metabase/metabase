(ns metabase.driver.sql.parameters.substitute
  (:require [clojure.string :as str]
            [metabase.driver :as driver]
            [metabase.driver.common.parameters :as i]
            [metabase.driver.sql.parameters.substitution :as substitution]
            [metabase.query-processor.error-type :as error-type]
            [metabase.util.i18n :refer [tru]]))

(defn- substitute-field-filter [[sql args missing] in-optional? k {:keys [field value], :as v}]
  (if (and (= i/no-value value) in-optional?)
    ;; no-value field filters inside optional clauses are ignored, and eventually emitted entirely
    [sql args (conj missing k)]
    ;; otherwise no values get replaced with `1 = 1` and other values get replaced normally
    (let [{:keys [replacement-snippet prepared-statement-args]} (substitution/->replacement-snippet-info driver/*driver* v)]
      [(str sql replacement-snippet) (concat args prepared-statement-args) missing])))

(defn- subsistute-card-query [[sql args missing] v]
  (let [{:keys [replacement-snippet]} (substitution/->replacement-snippet-info driver/*driver* v)]
    [(str sql replacement-snippet) args missing]))

(defn- substitute-native-query-snippet [[sql args missing] v]
   (let [{:keys [replacement-snippet]} (substitution/->replacement-snippet-info driver/*driver* v)]
     [(str sql replacement-snippet) args missing]))

(defn- substitute-param [param->value [sql args missing] in-optional? {:keys [k]}]
  (if-not (contains? param->value k)
    [sql args (conj missing k)]
    (let [v (get param->value k)]
      (cond
        (i/FieldFilter? v)
        (substitute-field-filter [sql args missing] in-optional? k v)

        (i/ReferencedCardQuery? v)
        (subsistute-card-query [sql args missing] v)

        (i/ReferencedQuerySnippet? v)
        (substitute-native-query-snippet [sql args missing] v)

        (= i/no-value v)
        [sql args (conj missing k)]

        :else
        (let [{:keys [replacement-snippet prepared-statement-args]} (substitution/->replacement-snippet-info driver/*driver* v)]
          [(str sql replacement-snippet) (concat args prepared-statement-args) missing])))))

(declare substitute*)

(defn- substitute-optional [param->value [sql args missing] {subclauses :args}]
  (let [[opt-sql opt-args opt-missing] (substitute* param->value subclauses true)]
    (if (seq opt-missing)
      [sql args missing]
      [(str sql opt-sql) (concat args opt-args) missing])))

(defn- substitute*
  "Returns a sequence of `[replaced-sql-string jdbc-args missing-parameters]`."
  [param->value parsed in-optional?]
  (reduce
   (fn [[sql args missing] x]
     (cond
       (string? x)
       [(str sql x) args missing]

       (i/Param? x)
       (substitute-param param->value [sql args missing] in-optional? x)

       (i/Optional? x)
       (substitute-optional param->value [sql args missing] x)))
   nil
   parsed))

(defn substitute
  "Substitute `Optional` and `Param` objects in a `parsed-query`, a sequence of parsed string fragments and tokens, with
  the values from the map `param->value` (using logic from `substitution` to decide what replacement SQL should be
  generated).

    (substitute [\"select * from foobars where bird_type = \" (param \"bird_type\")]
                 {\"bird_type\" \"Steller's Jay\"})
    ;; -> [\"select * from foobars where bird_type = ?\" [\"Steller's Jay\"]]"
  [parsed-query param->value]
  (let [[sql args missing] (try
                             (substitute* param->value parsed-query false)
                             (catch Throwable e
                               (throw (ex-info (tru "Unable to substitute parameters")
                                        {:type         (or (:type (ex-data e)) error-type/qp)
                                         :params       param->value
                                         :parsed-query parsed-query}
                                        e))))]
    (when (seq missing)
      (throw (ex-info (tru "Cannot run the query: missing required parameters: {0}" (set missing))
               {:type    error-type/missing-required-parameter
                :missing missing})))
    [(str/trim sql) args]))
