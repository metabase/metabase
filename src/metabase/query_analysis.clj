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
   [metabase.util.queue :as queue]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private realtime-queue-capacity 1000)

(defonce ^:private queue (queue/bounded-transfer-queue realtime-queue-capacity {:dedupe? true}))

(def ^:dynamic *analyze-queries-in-test?*
  "Normally, a card's query is analyzed on every create/update. For most tests, this is an unnecessary expense.
  Therefore, we skip parsing while testing unless this variable is turned on."
  false)


(defn- enabled? []
  (or (not config/is-test?)
      *analyze-queries-in-test?*))

(defn enabled-type?
  "Is analysis of the given query type enabled?"
  [query-type]
  (case query-type
    :native     (public-settings/sql-parsing-enabled)
    :query      true
    :mbql/query true
    false))

(defn- query-field-ids
  "Find out ids of all fields used in a query. Conforms to the same protocol as [[query-analyzer/field-ids-for-sql]],
  so returns `{:explicit #{...int ids}}` map.

  Does not track wildcards for queries rendered as tables afterwards."
  [query]
  (let [query-type (lib/normalized-query-type query)]
    (when (enabled-type? query-type)
      (case query-type
        :native     (try
                      (nqa/field-ids-for-native query)
                      (catch Exception e
                        (log/error e "Error parsing SQL" query)))
        :query      {:explicit (mbql.u/referenced-field-ids query)}
        :mbql/query {:explicit (lib.util/referenced-field-ids query)}))))

(defn update-query-analysis-for-card!
  "Clears QueryFields associated with this card and creates fresh, up-to-date-ones.

  Returns `nil` (and logs the error) if there was a parse error."
  [{card-id :id, query :dataset_query}]
  (let [{:keys [explicit implicit] :as res} (query-field-ids query)
        id->row          (fn [explicit? field-id]
                           {:card_id            card-id
                            :field_id           field-id
                            :explicit_reference explicit?})
        query-field-rows (concat
                          (map (partial id->row true) explicit)
                          (map (partial id->row false) implicit))]
    ;; when the response is `nil`, it's a disabled parser, not unknown columns
    (when (some? res)
      (query-field/update-query-fields-for-card! card-id query-field-rows))))

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

(defn analyze-card!
  "Update the analysis for the given card, if it is active."
  [card-id]
  (when (enabled?)
    (let [card (t2/select-one [:model/Card :id :archived :dataset_query] card-id)]
      (cond
        (not card)       (log/warnf "Card not found: %" card-id)
        (:archived card) (log/warnf "Skipping archived card: %" card-id)
        :else            (log/infof "Performing query analysis for card %s" card-id))
      (when (and card (not (:archived card)))
        (update-query-analysis-for-card! card)))))

(defn next-card-id!
  "Get the id of the next card id to be analyzed. May block indefinitely, relies on producer."
  []
  (queue/blocking-take! queue))


(defn analyze-sync!
  "Synchronously hand-off the given card for analysis, at a low priority. May block indefinitely, relies on consumer."
  [card-or-id]
  (when (enabled?)
    (queue/maybe-put! queue (u/the-id card-or-id))))

(defn analyze-sync!
  "Synchronously hand-off the given card for analysis, at a low priority. May block indefinitely, relies on consumer."
  [card-or-id]
  (when (enabled?)
    (queue/blocking-put! queue (u/the-id card-or-id))))
