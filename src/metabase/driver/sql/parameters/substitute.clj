(ns metabase.driver.sql.parameters.substitute
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.sql.parameters.substitution
    :as sql.params.substitution]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(defn- substitute-field-filter [[sql args missing] in-optional? k {:keys [_field value], :as v}]
  (if (and (= params/no-value value) in-optional?)
    ;; no-value field filters inside optional clauses are ignored, and eventually emitted entirely
    [sql args (conj missing k)]
    ;; otherwise no values get replaced with `1 = 1` and other values get replaced normally
    (let [{:keys [replacement-snippet prepared-statement-args]}
          (sql.params.substitution/->replacement-snippet-info driver/*driver* v)]
      [(str sql replacement-snippet) (concat args prepared-statement-args) missing])))

(defn- substitute-card-query [[sql args missing] v]
  (let [{:keys [replacement-snippet prepared-statement-args]}
        (sql.params.substitution/->replacement-snippet-info driver/*driver* v)]
    [(str sql replacement-snippet) (concat args prepared-statement-args) missing]))

(defn- substitute-native-query-snippet [[sql args missing] v]
   (let [{:keys [replacement-snippet]} (sql.params.substitution/->replacement-snippet-info driver/*driver* v)]
     [(str sql replacement-snippet) args missing]))

(defn- substitute-param [param->value [sql args missing] in-optional? {:keys [k]}]
  (if-not (contains? param->value k)
    [sql args (conj missing k)]
    (let [v (get param->value k)]
      (cond
        (params/FieldFilter? v)
        (substitute-field-filter [sql args missing] in-optional? k v)

        (params/ReferencedCardQuery? v)
        (substitute-card-query [sql args missing] v)

        (params/ReferencedQuerySnippet? v)
        (substitute-native-query-snippet [sql args missing] v)

        (= params/no-value v)
        [sql args (conj missing k)]

        :else
        (let [{:keys [replacement-snippet prepared-statement-args]}
              (sql.params.substitution/->replacement-snippet-info driver/*driver* v)]
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

       (params/Param? x)
       (substitute-param param->value [sql args missing] in-optional? x)

       (params/Optional? x)
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
  (log/tracef "Substituting params\n%s\nin query:\n%s" (u/pprint-to-str param->value) (u/pprint-to-str parsed-query))
  (let [[sql args missing] (try
                             (substitute* param->value parsed-query false)
                             (catch Throwable e
                               (throw (ex-info (tru "Unable to substitute parameters: {0}" (ex-message e))
                                        {:type         (or (:type (ex-data e)) qp.error-type/qp)
                                         :params       param->value
                                         :parsed-query parsed-query}
                                        e))))]
    (log/tracef "=>%s\n%s" sql (pr-str args))
    (when (seq missing)
      (throw (ex-info (tru "Cannot run the query: missing required parameters: {0}" (set missing))
               {:type    qp.error-type/missing-required-parameter
                :missing missing})))
    [(str/trim sql) args]))
