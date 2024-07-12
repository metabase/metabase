(ns metabase.query-analysis
  (:require
   [metabase.config :as config]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.models.query-field :as query-field]
   [metabase.public-settings :as public-settings]
   [metabase.query-analysis.native-query-analyzer :as nqa]
   [metabase.util.log :as log]))

(def ^:dynamic *parse-queries-in-test?*
  "Normally, a native card's query is parsed on every create/update. For most tests, this is an unnecessary
  expense. Therefore, we skip parsing while testing unless this variable is turned on.

  c.f. [[native-analysis-active?]]"
  false)

(defn- native-analysis-active?
  "Should the query run? Either we're not testing or it's been explicitly turned on.

  c.f. [[*parse-queries-in-test?*]], [[public-settings/sql-parsing-enabled]]"
  []
  (and (public-settings/sql-parsing-enabled)
       (or (not config/is-test?)
           *parse-queries-in-test?*)))

(defn enabled?
  "Is analysis of the given query type enabled?"
  [query-type]
  (case query-type
    :native (native-analysis-active?)
    true))

(defn- query-field-ids
  "Find out ids of all fields used in a query. Conforms to the same protocol as [[query-analyzer/field-ids-for-sql]],
  so returns `{:explicit #{...int ids}}` map.

  Does not track wildcards for queries rendered as tables afterwards."
  [query]
  (let [query-type (lib/normalized-query-type query)]
    (when (enabled? query-type)
      (case query-type
        :native (try
                  (nqa/field-ids-for-native query)
                  (catch Exception e
                    (log/error e "Error parsing SQL" query)))
        :query      {:explicit (mbql.u/referenced-field-ids query)}
        :mbql/query {:explicit (lib.util/referenced-field-ids query)}
        nil))))

(defn update-query-analysis-for-card!
  "Clears QueryFields associated with this card and creates fresh, up-to-date-ones.

  If you're invoking this from a test, be sure to turn on [[*parse-queries-in-test?*]].

  Returns `nil` (and logs the error) if there was a parse error."
  [{card-id :id, query :dataset_query}]
  (try
    (let [{:keys [explicit implicit] :as res} (query-field-ids query)
          id->row                             (fn [explicit? field-id]
                                                {:card_id            card-id
                                                 :field_id           field-id
                                                 :explicit_reference explicit?})
          query-field-rows                    (concat
                                               (map (partial id->row true) explicit)
                                               (map (partial id->row false) implicit))]
      ;; when the response is `nil`, it's a disabled parser, not unknown columns
      (when (some? res)
        (query-field/update-query-fields-for-card! card-id query-field-rows)))
    (catch Exception e
      (log/error e "Error updating query fields"))))
