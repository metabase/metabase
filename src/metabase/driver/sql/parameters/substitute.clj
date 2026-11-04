(ns metabase.driver.sql.parameters.substitute
  (:refer-clojure :exclude [not-empty])
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters :as params]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [not-empty]]))

(declare #^:private substitute*)

(def ^:private max-substituted-sql-length
  "Maximum length of the SQL produced by substituting parameters into a native query."
  10000000)

(def ^:private max-snippet-expansions
  "Maximum number of native query snippets that can be expanded while substituting parameters into a native query."
  10000)

(defn- check-snippet-expansion! [{:keys [expanding-snippet-ids snippet-expansions]} {:keys [snippet-id]}]
  (when (contains? expanding-snippet-ids snippet-id)
    (throw (ex-info (tru "This query has circular referencing snippets.")
                    {:type driver-api/qp.error-type.invalid-query, :snippet-id snippet-id})))
  (when (> (vswap! snippet-expansions inc) max-snippet-expansions)
    (throw (ex-info (tru "This query uses too many snippets.")
                    {:type driver-api/qp.error-type.invalid-query}))))

(defn- check-sql-length! [[sql :as acc]]
  (when (> (count sql) max-substituted-sql-length)
    (throw (ex-info (tru "This query is too long.")
                    {:type driver-api/qp.error-type.invalid-query})))
  acc)

(defn- substitute-field-param [[sql args missing] in-optional? k {:keys [_field value], :as v}]
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

(defn- substitute-native-query-snippet
  "`ctx` holds `:expanding-snippet-ids`, the IDs of the snippets currently being expanded (to detect snippets that
  reference themselves), and `:snippet-expansions`, a volatile count of the snippets expanded so far."
  [ctx param->value [sql args missing] in-optional? v]
  (check-snippet-expansion! ctx v)
  (let [{:keys [replacement-snippet]} (sql.params.substitution/->replacement-snippet-info driver/*driver* v)
        [processed-snippet snippet-args snippet-missing] (substitute* (update ctx :expanding-snippet-ids conj (:snippet-id v))
                                                                      param->value
                                                                      (params.parse/parse replacement-snippet)
                                                                      in-optional?)]
    [(str sql processed-snippet)
     (not-empty (concat args snippet-args))
     (not-empty (concat missing snippet-missing))]))

(defn- substitute-param [ctx param->value [sql args missing] in-optional? {:keys [k]}]
  (if-not (contains? param->value k)
    [sql args (conj missing k)]
    (let [v (get param->value k)]
      (cond
        (or (params/FieldFilter? v)
            (params/TemporalUnit? v))
        (substitute-field-param [sql args missing] in-optional? k v)

        (params/ReferencedCardQuery? v)
        (substitute-card-query [sql args missing] v)

        (params/ReferencedQuerySnippet? v)
        (substitute-native-query-snippet ctx param->value [sql args missing] in-optional? v)

        (= params/no-value v)
        [sql args (conj missing k)]

        :else
        (let [{:keys [replacement-snippet prepared-statement-args]}
              (sql.params.substitution/->replacement-snippet-info driver/*driver* v)]
          [(str sql replacement-snippet) (concat args prepared-statement-args) missing])))))

(declare substitute*)

(defn- substitute-optional [ctx param->value [sql args missing] {subclauses :args}]
  (let [[opt-sql opt-args opt-missing] (substitute* ctx param->value subclauses true)]
    (if (seq opt-missing)
      [sql args missing]
      [(str sql opt-sql) (concat args opt-args) missing])))

(defn- substitute*
  "Returns a sequence of `[replaced-sql-string jdbc-args missing-parameters]`."
  [ctx param->value parsed in-optional?]
  (reduce
   (fn [[sql args missing] x]
     (check-sql-length!
      (cond
        (string? x)
        [(str sql x) args missing]

        (params/Param? x)
        (substitute-param ctx param->value [sql args missing] in-optional? x)

        (params/Optional? x)
        (substitute-optional ctx param->value [sql args missing] x))))
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
                             (substitute* {:expanding-snippet-ids #{}, :snippet-expansions (volatile! 0)}
                                          param->value
                                          parsed-query
                                          false)
                             (catch Throwable e
                               (throw (ex-info (tru "Unable to substitute parameters: {0}" (ex-message e))
                                               {:type         (or (:type (ex-data e)) driver-api/qp.error-type.qp)
                                                :params       param->value
                                                :parsed-query parsed-query}
                                               e))))]
    (log/tracef "=>%s\n%s" sql (pr-str args))
    (when (seq missing)
      (throw (ex-info (tru "Cannot run the query: missing required parameters: {0}" (set missing))
                      {:type    driver-api/qp.error-type.missing-required-parameter
                       :missing missing})))
    [(str/trim sql) args]))
