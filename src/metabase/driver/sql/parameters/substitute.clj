(ns metabase.driver.sql.parameters.substitute
  (:require [clojure.string :as str]
            [metabase.driver :as driver]
            [metabase.driver.common.parameters :as i]
            [metabase.driver.common.parameters.parse :as parse]
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

(defn- substitute-card-query [[sql args missing] v]
  (let [{:keys [replacement-snippet prepared-statement-args]} (substitution/->replacement-snippet-info driver/*driver* v)]
    [(str sql replacement-snippet) (concat args prepared-statement-args) missing]))

(declare substitute*)

(defn- substitute-native-query-snippet [[sql args missing] v param->value in-optional? seen-params]
   (let [{:keys [replacement-snippet]} (substitution/->replacement-snippet-info driver/*driver* v)
         parsed-replacement (parse/parse replacement-snippet)]
     (if (not-any? i/Param? parsed-replacement)
       [(str sql replacement-snippet) args missing] ; no nested parameters, just splice in the SQL
       (let [[recursive-query & _]
             (substitute* param->value parsed-replacement in-optional? seen-params)]
         [(str sql recursive-query) args missing]))))

(defn- substitute-param [param->value [sql args missing] in-optional? {:keys [k]} seen-params]
  (if-not (contains? param->value k)
    [sql args (conj missing k)]
    (let [v (get param->value k)]
      (cond
        (contains? seen-params k)
        (throw (ex-info (tru "Cycle detected when resolving parameters")
                        {:type         error-type/qp
                         :params       param->value
                         :sql          sql
                         :seen-params  seen-params}))
        (i/FieldFilter? v)
        (substitute-field-filter [sql args missing] in-optional? k v)

        (i/ReferencedCardQuery? v)
        (substitute-card-query [sql args missing] v)

        (i/ReferencedQuerySnippet? v)
        (substitute-native-query-snippet [sql args missing] v param->value in-optional? (conj seen-params k))

        (= i/no-value v)
        [sql args (conj missing k)]

        :else
        (let [{:keys [replacement-snippet prepared-statement-args]} (substitution/->replacement-snippet-info driver/*driver* v)]
          [(str sql replacement-snippet) (concat args prepared-statement-args) missing])))))


(defn- substitute-optional [param->value [sql args missing] {subclauses :args}]
  (let [[opt-sql opt-args opt-missing] (substitute* param->value subclauses true)]
    (if (seq opt-missing)
      [sql args missing]
      [(str sql opt-sql) (concat args opt-args) missing])))

(defn- substitute*
  "Returns a sequence of `[replaced-sql-string jdbc-args missing-parameters]`."
  ([param->value parsed in-optional?]
   (substitute* param->value parsed in-optional? #{}))
  ([param->value parsed in-optional? seen-params]
   (reduce
     (fn [[sql args missing] x]
       (cond
         (string? x)
         [(str sql x) args missing]

         (i/Param? x)
         (substitute-param param->value [sql args missing] in-optional? x seen-params)

         (i/Optional? x)
         (substitute-optional param->value [sql args missing] x)))
     nil
     parsed)))

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
                                        (merge
                                          (ex-data e)
                                          {:type         (or (:type (ex-data e)) error-type/qp)
                                           :params       param->value
                                           :parsed-query parsed-query})
                                        e))))]
    (when (seq missing)
      (throw (ex-info (tru "Cannot run the query: missing required parameters: {0}" (set missing))
               {:type    error-type/missing-required-parameter
                :missing missing})))
    [(str/trim sql) args]))
