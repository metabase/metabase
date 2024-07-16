(ns metabase.query-analysis
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.models.query-field :as query-field]
   [metabase.public-settings :as public-settings]
   [metabase.query-analysis.native-query-analyzer :as nqa]
   [metabase.query-analysis.native-query-analyzer.replacement :as nqa.replacement]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
    :native     (native-analysis-active?)
    :query      true
    :mbql/query true
    false))

(defn- query-field-ids
  "Find out ids of all fields used in a query. Conforms to the same protocol as [[query-analyzer/field-ids-for-sql]],
  so returns `{:explicit #{...int ids}}` map.

  Does not track wildcards for queries rendered as tables afterwards."
  [query]
  (let [query-type (lib/normalized-query-type query)]
    (when (enabled? query-type)
      (case query-type
        :native     (try
                      (nqa/field-ids-for-native query)
                      (catch Exception e
                        (log/error e "Error parsing SQL" query)))
        :query      {:explicit (mbql.u/referenced-field-ids query)}
        :mbql/query {:explicit (lib.util/referenced-field-ids query)}))))

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

(defn- replaced-inner-query-for-native-card
  [query {:keys [fields tables] :as _replacement-ids}]
  (let [keyvals-set         #(set/union (set (keys %))
                                        (set (vals %)))
        id->field           (if (empty? fields)
                              {}
                              (m/index-by :id
                                          (t2/query {:select [[:f.id :id]
                                                              [:f.name :column]
                                                              [:t.name :table]
                                                              [:t.schema :schema]]
                                                     :from   [[:metabase_field :f]]
                                                     :join   [[:metabase_table :t] [:= :f.table_id :t.id]]
                                                     :where  [:in :f.id (keyvals-set fields)]})))
        id->table           (if (empty? tables)
                              {}
                              (m/index-by :id
                                          (t2/query {:select [[:t.id :id]
                                                              [:t.name :table]
                                                              [:t.schema :schema]]
                                                     :from   [[:metabase_table :t]]
                                                     :where  [:in :t.id (keyvals-set tables)]})))
        remove-id           #(select-keys % [:column :table :schema])
        get-or-throw-from   (fn [m] (fn [k] (if (contains? m k)
                                              (remove-id (get m k))
                                              (throw (ex-info "ID not found" {:id k :available m})))))
        ids->replacements   (fn [id->replacement-id id->row row->identifier]
                              (-> id->replacement-id
                                  (u/update-keys-vals (get-or-throw-from id->row))
                                  (update-vals row->identifier)))
        ;; Note: we are naively providing unqualified new identifier names as the replacements.
        ;; this will break if previously unambiguous identifiers become ambiguous due to the replacements
        column-replacements (ids->replacements fields id->field :column)
        table-replacements  (ids->replacements tables id->table :table)]
    (nqa.replacement/replace-names query {:columns column-replacements
                                          :tables  table-replacements})))

(defn replace-fields-and-tables
  "Given a card and a map of the form

  {:fields {1 2, 3 4}
   :tables {100 101}}

  Update the card so that its references to the Field with ID 1 are replaced by Field 2, etc."
  [{card-type :query_type, q :dataset_query :as card} replacements]
  (case card-type
    :native (replaced-inner-query-for-native-card q replacements)
    (throw (ex-info "We don't (yet) support replacing field and table refs in cards with MBQL queries"
                    {:card card :replacements replacements}))))
