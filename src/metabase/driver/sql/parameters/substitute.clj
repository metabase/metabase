(ns metabase.driver.sql.parameters.substitute
  (:refer-clojure :exclude [not-empty])
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [not-empty]]))

(set! *warn-on-reflection* true)

(declare #^:private substitute*)

(def ^:private max-substituted-sql-length
  "Maximum length of the SQL produced by substituting parameters into a native query."
  10000000)

(def ^:private max-snippet-expansions
  "Maximum number of native query snippets that can be expanded while substituting parameters into a native query."
  10000)

(defn- check-snippet-expansion! [{:keys [snippet-path snippet-expansions]} {:keys [snippet-id]}]
  (when (contains? snippet-path snippet-id)
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

(defn- ->replacement-snippet-info [metadata-providerable x]
  (qp.store/with-metadata-provider metadata-providerable
    (sql.params.substitution/->replacement-snippet-info driver/*driver* x)))

(mr/def ::acc
  [:maybe
   [:tuple
    #_sql     [:maybe string?]
    #_args    [:maybe [:sequential ::lib.schema.literal/param-value]]
    #_missing [:maybe [:sequential :string]]]])

(mr/def ::ctx
  [:map {:closed true}
   ;; IDs of the snippets currently being expanded, used to detect snippets that reference themselves
   [:snippet-path       [:set ::lib.schema.id/snippet]]
   ;; volatile count of the snippets expanded so far by the current call to [[substitute]]
   [:snippet-expansions [:fn volatile?]]])

(mu/defn- substitute-field-param :- ::acc
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   [sql args missing]    :- ::acc
   in-optional?          :- :boolean
   k                     :- :string
   {:keys [_field value], :as v} :- [:or
                                     :metabase.lib.parameters.parse.types/field-filter
                                     :metabase.lib.parameters.parse.types/temporal-unit]]
  (if (and (= value lib/parsed-param-no-value-placeholder) in-optional?)
    ;; no-value field filters inside optional clauses are ignored, and eventually emitted entirely
    [sql args (conj missing k)]
    ;; otherwise no values get replaced with `1 = 1` and other values get replaced normally
    (let [{:keys [replacement-snippet prepared-statement-args]}
          (->replacement-snippet-info metadata-providerable v)]
      [(str sql replacement-snippet) (concat args prepared-statement-args) missing])))

(mu/defn- substitute-simple-query :- ::acc
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   [sql args missing]    :- ::acc
   v                     :- [:or
                             :metabase.lib.parameters.parse.types/referenced-card-query
                             :metabase.lib.parameters.parse.types/referenced-table-query]]
  (let [{:keys [replacement-snippet prepared-statement-args]}
        (->replacement-snippet-info metadata-providerable v)]
    [(str sql replacement-snippet) (concat args prepared-statement-args) missing]))

(mu/defn- substitute-native-query-snippet :- ::acc
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   ctx                   :- ::ctx
   param->value          :- [:maybe [:map-of :string :metabase.lib.parameters.parse.types/parsed-value]]
   [sql args missing]    :- ::acc
   in-optional?          :- :boolean
   v                     :- :metabase.lib.parameters.parse.types/referenced-query-snippet]
  (check-snippet-expansion! ctx v)
  (let [{:keys [replacement-snippet]}                    (->replacement-snippet-info metadata-providerable v)
        [processed-snippet snippet-args snippet-missing] (substitute*
                                                          metadata-providerable
                                                          (update ctx :snippet-path conj (:snippet-id v))
                                                          param->value
                                                          (lib/parse-parameters replacement-snippet)
                                                          in-optional?)]
    [(str sql processed-snippet)
     (not-empty (concat args snippet-args))
     (not-empty (concat missing snippet-missing))]))

(mu/defn- substitute-param :- ::acc
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   ctx                   :- ::ctx
   param->value          :- [:maybe [:map-of :string :metabase.lib.parameters.parse.types/parsed-value]]
   [sql args missing]    :- ::acc
   in-optional?          :- :boolean
   {:keys [k]} :- :metabase.lib.parameters.parse.types/param]
  (if-not (contains? param->value k)
    [sql args (conj missing k)]
    (let [v (get param->value k)]
      (cond
        (or (lib/parsed-field-filter-param? v)
            (lib/parsed-temporal-unit-param? v))
        (substitute-field-param metadata-providerable [sql args missing] in-optional? k v)

        (or (lib/parsed-referenced-card-query-param? v)
            (lib/parsed-referenced-table-query-param? v))
        (substitute-simple-query metadata-providerable [sql args missing] v)

        (lib/parsed-referenced-query-snippet-param? v)
        (substitute-native-query-snippet metadata-providerable ctx param->value [sql args missing] in-optional? v)

        (= v lib/parsed-param-no-value-placeholder)
        [sql args (conj missing k)]

        :else
        (let [{:keys [replacement-snippet prepared-statement-args]}
              (->replacement-snippet-info metadata-providerable v)]
          [(str sql replacement-snippet) (concat args prepared-statement-args) missing])))))

(mu/defn- substitute-optional :- ::acc
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   ctx                   :- ::ctx
   param->value          :- [:maybe [:map-of :string :metabase.lib.parameters.parse.types/parsed-value]]
   [sql args missing]    :- ::acc
   {subclauses :args} :- :metabase.lib.parameters.parse.types/optional]
  (let [[opt-sql opt-args opt-missing] (substitute* metadata-providerable ctx param->value subclauses true)]
    (if (seq opt-missing)
      [sql args missing]
      [(str sql opt-sql) (concat args opt-args) missing])))

(mu/defn- substitute* :- ::acc
  "Returns a sequence of `[replaced-sql-string jdbc-args missing-parameters]`."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   ctx                   :- ::ctx
   param->value          :- [:maybe [:map-of :string :metabase.lib.parameters.parse.types/parsed-value]]
   parsed                :- [:sequential :metabase.lib.parameters.parse/parsed-token]
   in-optional?          :- :boolean]
  (reduce
   (fn [[sql args missing] x]
     (check-sql-length!
      (cond
        (string? x)
        [(str sql x) args missing]

        (lib/parsed-param? x)
        (substitute-param metadata-providerable ctx param->value [sql args missing] in-optional? x)

        (lib/parsed-optional-param? x)
        (substitute-optional metadata-providerable ctx param->value [sql args missing] x)

        :else
        (throw (ex-info (format "Unexpected parsed param ^%s %s" (some-> x class .getCanonicalName) (pr-str x)) {:x x})))))
   nil
   parsed))

(mu/defn substitute :- [:tuple #_sql :string #_args [:maybe [:sequential :any]]]
  "Substitute `Optional` and `Param` objects in a `parsed-query`, a sequence of parsed string fragments and tokens, with
  the values from the map `param->value` (using logic from `substitution` to decide what replacement SQL should be
  generated).

    (substitute [\"select * from foobars where bird_type = \" (param \"bird_type\")]
                 {\"bird_type\" \"Steller's Jay\"})
    ;; -> [\"select * from foobars where bird_type = ?\" [\"Steller's Jay\"]]"
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   parsed-query          :- [:sequential :metabase.lib.parameters.parse/parsed-token]
   param->value          :- [:maybe [:map-of :string :metabase.lib.parameters.parse.types/parsed-value]]]
  (log/tracef "Substituting %d params in query" (count param->value))
  (let [[sql args missing] (try
                             (substitute* metadata-providerable
                                          {:snippet-path #{}, :snippet-expansions (volatile! 0)}
                                          param->value
                                          parsed-query
                                          false)
                             (catch Throwable e
                               (throw (ex-info (tru "Unable to substitute parameters: {0}" (ex-message e))
                                               {:type         (or (:type (ex-data e)) driver-api/qp.error-type.qp)
                                                :params       param->value
                                                :parsed-query parsed-query}
                                               e))))]
    (log/tracef "Substituted %d params" (count args))
    (when (seq missing)
      (throw (ex-info (tru "Cannot run the query: missing required parameters: {0}" (set missing))
                      {:type    driver-api/qp.error-type.missing-required-parameter
                       :missing missing})))
    [(str/trim sql) args]))
