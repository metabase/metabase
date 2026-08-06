(ns metabase.usage-metadata.candidate-builders
  "Per-type deterministic builders for Table, Metric, Measure, and Segment candidates."
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.measure :as lib.schema.measure]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.candidate-suggestions :as candidate-suggestions]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.string :as u.str]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table-dependency-path
  [model-lineage]
  {:direct? (empty? model-lineage)
   :models  model-lineage})

(defn- merge-table-dependency-results
  [left right]
  {:table-paths (merge-with into (:table-paths left) (:table-paths right))
   :unsupported (into (:unsupported left) (:unsupported right))})

(defn- card-table-dependencies
  "Resolve every physical table reached by `card`, following saved-model references recursively.

  `model-lineage` records only the intermediate models between the original evidence Card and a
  table. `visited` is path-local: it prevents cycles without collapsing distinct model paths that
  happen to reach the same table."
  [card model-index model-lineage visited]
  (try
    (if-let [query (candidate-mining/wrap-query (:database_id card) (:dataset_query card))]
      (if (lib/any-native-stage? query)
        {:table-paths {}
         :unsupported [{:reason :native-query, :model-lineage model-lineage}]}
        (let [table-ids (into (or (lib/all-source-table-ids query) #{})
                              (or (lib/all-implicitly-joined-table-ids query) #{}))
              direct    {:table-paths (into {}
                                            (map (fn [table-id]
                                                   [table-id #{(table-dependency-path model-lineage)}]))
                                            table-ids)
                         :unsupported []}
              model-ids (->> (lib/all-source-card-ids query)
                             (keep model-index)
                             (map :id)
                             distinct
                             sort)]
          (reduce
           (fn [result model-id]
             (if (contains? visited model-id)
               result
               (let [model (model-index model-id)]
                 (merge-table-dependency-results
                  result
                  (card-table-dependencies model
                                           model-index
                                           (conj model-lineage (select-keys model [:id :name]))
                                           (conj visited model-id))))))
           direct
           model-ids)))
      {:table-paths {}
       :unsupported [{:reason :unreadable-query, :model-lineage model-lineage}]})
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (log/debug e "Failed to resolve candidate table dependencies")
      {:table-paths {}
       :unsupported [{:reason :unreadable-query, :model-lineage model-lineage}]})))

(defn- dependency-path-sort-key
  [{:keys [direct? models]}]
  [(if direct? 0 1) (mapv :id models)])

(defn- table-source-item-evidence
  [source-items]
  (let [{:keys [id name type verified? official-collection? popular? view-count]} (first source-items)]
    {:id                   id
     :name                 name
     :type                 type
     :verified?            verified?
     :official-collection? official-collection?
     :popular?             popular?
     :view-count           view-count
     :dependency-paths     (->> source-items
                                (mapcat :dependency-paths)
                                distinct
                                (sort-by dependency-path-sort-key)
                                vec)}))

(defn- table-candidate-evidence
  [source-items]
  (let [items (->> source-items
                   (group-by :id)
                   vals
                   (map table-source-item-evidence)
                   (sort-by :id)
                   vec)]
    {:source-items          items
     :distinct-source-count (count items)
     :verified-source-count (count (filter :verified? items))
     :official-source-count (count (filter :official-collection? items))
     :popular-source-count  (count (filter :popular? items))
     :total-view-count      (reduce + 0 (map :view-count items))}))

(defn- raw-table-candidate-analysis
  [cards model-index]
  (reduce
   (fn [analysis card]
     (let [{:keys [table-paths unsupported]}
           (card-table-dependencies card model-index [] #{(:id card)})
           source-base (select-keys card [:id :name :type :verified? :official-collection? :popular? :view-count])]
       (-> analysis
           (update :table-source-items into
                   (map (fn [[table-id dependency-paths]]
                          {:table-id    table-id
                           :source-item (assoc source-base :dependency-paths (vec dependency-paths))})
                        table-paths))
           (update :unsupported into
                   (map (fn [{:keys [reason model-lineage]}]
                          (cond-> (assoc (select-keys source-base [:id :name :type]) :reason reason)
                            (seq model-lineage) (assoc :model-lineage model-lineage)))
                        unsupported)))))
   {:table-source-items [], :unsupported []}
   cards))

(defn- usable-table-dependency?
  [table database]
  (boolean
   (and (:active table)
        (nil? (:visibility_type table))
        (not= :hidden (:data_layer table))
        database
        (not (:is_audit database))
        (not (:is_sample database))
        (nil? (:router_database_id database)))))

(defn- eligible-candidate-table?
  [table database]
  (and (usable-table-dependency? table database)
       (not (:is_published table))))

(defn- table-dependency-index
  [table-ids eligible? include-published?]
  (let [table-ids (into #{} (filter pos-int?) table-ids)
        tables    (when (seq table-ids)
                    (t2/select [:model/Table :id :db_id :schema :name :display_name :description
                                :data_layer :data_authority :view_count :active :visibility_type
                                :is_published]
                               :id [:in table-ids]))
        db-ids    (into #{} (keep :db_id) tables)
        databases (when (seq db-ids)
                    (u/index-by :id
                                (t2/select [:model/Database :id :name :is_audit :is_sample
                                            :router_database_id]
                                           :id [:in db-ids])))]
    (into {}
          (keep (fn [{:keys [id db_id schema name display_name description data_layer data_authority
                             view_count]
                      :as table}]
                  (let [database (databases db_id)]
                    (when (eligible? table database)
                      [id (cond-> {:id             id
                                   :database-id    db_id
                                   :database-name  (:name database)
                                   :schema         schema
                                   :name           name
                                   :display-name   (or display_name name)
                                   :description    description
                                   :data-layer     data_layer
                                   :data-authority data_authority
                                   :view-count     (long (or view_count 0))}
                            include-published? (assoc :published? (boolean (:is_published table))))]))))
          tables)))

(defn- candidate-table-index
  [table-ids]
  (table-dependency-index table-ids eligible-candidate-table? false))

(defn- metric-required-table-index
  [table-ids]
  (table-dependency-index table-ids usable-table-dependency? true))

(defn- candidate-table-sort-key
  [{:keys [table evidence]}]
  [(- (:verified-source-count evidence))
   (- (:official-source-count evidence))
   (if (= :authoritative (:data-authority table)) 0 1)
   (if (= :final (:data-layer table)) 0 1)
   (- (:distinct-source-count evidence))
   (- (:popular-source-count evidence))
   (- (:total-view-count evidence))
   (- (:view-count table))
   (or (:database-name table) "")
   (or (:schema table) "")
   (or (:name table) "")
   (:id table)])

(defn- rank-candidate-tables
  [candidates limit]
  (cond->> (sort-by candidate-table-sort-key candidates)
    limit (take limit)
    true  vec))

(defn- unsupported-source-item-sort-key
  [{:keys [id reason model-lineage]}]
  [id (name reason) (mapv :id model-lineage)])

(mu/defn candidate-table-observations :- ::usage-metadata.schema/candidate-table-report
  "Return every unpublished physical table reached by selected MBQL questions and models.

  This unbounded producer is the persistence boundary. Call [[candidate-tables]] when a ranked,
  presentation-sized result is required. `:limit` is deliberately ignored here so observations are
  never discarded before evidence from separate persistence batches is combined."
  ([] (candidate-table-observations {}))
  ([opts :- ::usage-metadata.schema/candidate-opts]
   (lib-be/with-metadata-provider-cache
     (let [cards        (candidate-mining/candidate-source-cards (dissoc opts :limit))
           models       (candidate-mining/candidate-model-index cards)
           analysis     (raw-table-candidate-analysis cards models)
           by-table     (group-by :table-id (:table-source-items analysis))
           table-index  (candidate-table-index (keys by-table))
           candidates   (rank-candidate-tables
                         (keep (fn [[table-id rows]]
                                 (when-let [table (table-index table-id)]
                                   {:table    table
                                    :evidence (table-candidate-evidence (map :source-item rows))}))
                               by-table)
                         nil)
           unsupported  (->> (:unsupported analysis)
                             distinct
                             (sort-by unsupported-source-item-sort-key)
                             vec)]
       {:candidates candidates, :unsupported-source-items unsupported}))))

(mu/defn candidate-tables :- ::usage-metadata.schema/candidate-table-report
  "Rank unpublished physical tables reached by selected MBQL questions and models.

  Saved-model dependencies are followed without the stage lineage barriers used by Measure and
  Segment extraction. The original selected Card remains the sole endorsement source, while every
  distinct model path is retained as provenance. Native and unreadable branches are returned in
  `:unsupported-source-items`. This is a read-only analysis and never publishes or updates a Table."
  ([] (candidate-tables {}))
  ([{:keys [limit] :as opts} :- ::usage-metadata.schema/candidate-opts]
   (let [limit  (or limit candidate-mining/candidate-default-limit)
         report (candidate-table-observations opts)]
     (update report :candidates #(vec (take limit %))))))

(defn- resolve-transparent-card-source
  [database-id source-card-id card-index seen]
  (candidate-mining/resolve-transparent-source database-id source-card-id card-index (constantly true) seen))

(defn- metric-result-shaping-stage?
  [stage]
  (or (seq (:fields stage))
      (some? (:limit stage))
      (some? (:page stage))
      (some? (:pivot stage))))

(defn- rewrite-metric-clause-list
  [query clauses table-id allow-no-fields?]
  (reduce (fn [rewritten clause]
            (when rewritten
              (when-let [{physical :clause}
                         (candidate-mining/physical-clause query 0 clause table-id allow-no-fields?)]
                (conj rewritten physical))))
          []
          clauses))

(defn- rewrite-metric-stage-to-table
  [query stage table-id]
  (when (and (not (seq (:joins stage)))
             (not (seq (:expressions stage))))
    (let [aggregations (rewrite-metric-clause-list query (:aggregation stage) table-id true)
          filters      (rewrite-metric-clause-list query (:filters stage) table-id false)
          breakouts    (rewrite-metric-clause-list query (:breakout stage) table-id false)]
      (when (and (= (count aggregations) (count (:aggregation stage)))
                 (= (count filters) (count (:filters stage)))
                 (= (count breakouts) (count (:breakout stage))))
        (cond-> (-> stage
                    (dissoc :source-card :order-by)
                    (assoc :source-table table-id))
          (seq aggregations) (assoc :aggregation aggregations)
          (seq filters)      (assoc :filters filters)
          (seq breakouts)    (assoc :breakout breakouts))))))

(defn- clean-metric-definition
  [query stage]
  (candidate-mining/canonical-form
   {:lib/type :mbql/query
    :database (:database query)
    :stages   [(dissoc stage :order-by)]}))

(defn- metric-table-ids
  [query]
  (into (or (lib/all-source-table-ids query) #{})
        (or (lib/all-implicitly-joined-table-ids query) #{})))

(defn- prepare-metric-definition
  [card card-index]
  (try
    (when-let [query (candidate-mining/wrap-query (:database_id card) (:dataset_query card))]
      (when (and (not (lib/any-native-stage? query))
                 (= 1 (lib/stage-count query)))
        (let [stage        (lib/query-stage query 0)
              source-card  (:source-card stage)
              direct-table (:source-table stage)]
          (when (and (= :mbql.stage/mbql (:lib/type stage))
                     (= 1 (count (:aggregation stage)))
                     (<= (count (:breakout stage)) 1)
                     (every? lib/raw-temporal-bucket (:breakout stage))
                     (not (metric-result-shaping-stage? stage)))
            (when-let [{:keys [stage model-lineage]}
                       (cond
                         (pos-int? direct-table)
                         {:stage stage, :model-lineage []}

                         (pos-int? source-card)
                         (when-let [{:keys [table-id model-lineage]}
                                    (resolve-transparent-card-source (:database_id card)
                                                                     source-card
                                                                     card-index
                                                                     #{})]
                           (when-let [rewritten (rewrite-metric-stage-to-table query stage table-id)]
                             {:stage rewritten, :model-lineage model-lineage}))

                         :else nil)]
              (let [definition (clean-metric-definition query stage)]
                (when-let [validated (candidate-mining/wrap-query (:database_id card) definition)]
                  (let [table-ids (metric-table-ids validated)]
                    (when (and (lib/can-save? validated :metric)
                               (seq table-ids)
                               (empty? (lib/all-source-card-ids validated))
                               (empty? (lib/all-segment-ids validated))
                               (empty? (lib/all-measure-ids validated)))
                      {:definition        definition
                       :query             validated
                       :model-lineage     model-lineage
                       :table-ids         table-ids
                       :aggregation       (get-in definition [:stages 0 :aggregation 0])
                       :temporal-breakout (get-in definition [:stages 0 :breakout 0])})))))))))
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (log/debug e "Failed to prepare candidate Metric definition")
      nil)))

(defn- meaningful-metric-context?
  [{:keys [query]}]
  (let [stage       (lib/query-stage query 0)
        table-id    (:source-table stage)
        aggregation (first (lib/aggregations query 0))]
    (or (seq (:filters stage))
        (candidate-mining/joined-stage? stage)
        (seq (:expressions stage))
        (nil? (candidate-mining/simple-aggregation query 0 aggregation table-id)))))

(defn- raw-metric-candidates
  [cards card-index]
  (into []
        (keep (fn [card]
                (when-let [{:keys [definition query model-lineage table-ids aggregation temporal-breakout]
                            :as prepared}
                           (prepare-metric-definition card card-index)]
                  (when (meaningful-metric-context? prepared)
                    (cond-> {::candidate-mining/signature         (candidate-mining/canonical-signature definition)
                             ::candidate-mining/source-item       (assoc card
                                                                         :model-lineage model-lineage
                                                                         :stage-number 0
                                                                         :joined? (candidate-mining/joined-stage?
                                                                                   (lib/query-stage query 0)))
                             ::candidate-mining/query             query
                             ::candidate-mining/table-ids         table-ids
                             :definition         definition
                             :aggregation        aggregation}
                      temporal-breakout (assoc :temporal-breakout temporal-breakout))))))
        cards))

(defn- existing-metric-definition-signatures
  []
  (candidate-mining/cached-candidate-analysis
   ::existing-metric-definition-signatures
   (fn []
     (let [metric-cards (t2/select [:model/Card :id :name :type :database_id :dataset_query :card_schema]
                                   :type :metric
                                   :archived false)
           card-index   (candidate-mining/candidate-lineage-card-index metric-cards)]
       (into #{}
             (keep (fn [card]
                     (some-> (prepare-metric-definition card card-index)
                             :definition
                             candidate-mining/canonical-signature)))
             metric-cards)))))

(defn- metric-source-sort-key
  [{source-item ::candidate-mining/source-item}]
  [(if (:verified? source-item) 0 1)
   (if (:official-collection? source-item) 0 1)
   (- (:view-count source-item))
   (:id source-item)])

(defn- metric-candidate-sort-key
  [{:keys [evidence], signature ::candidate-mining/signature}]
  [(- (:verified-source-count evidence))
   (- (:official-source-count evidence))
   (- (:distinct-source-count evidence))
   (- (:popular-source-count evidence))
   (- (:total-view-count evidence))
   signature])

(defn- required-table-sort-key
  [{:keys [database-name schema name id]}]
  [(or database-name "") (or schema "") (or name "") id])

(defn- metric-fallback-description
  [definition suggested-name]
  (let [aggregation-description (candidate-suggestions/safe-definition-description
                                 definition :aggregation suggested-name)
        filter-description      (when (seq (:filters (lib/query-stage definition 0)))
                                  (candidate-suggestions/safe-definition-description definition :filters nil))]
    (if (str/blank? filter-description)
      aggregation-description
      (tru "{0}; {1}" aggregation-description filter-description))))

(defn- metric-suggestions
  [candidate naming-candidate]
  (let [source-item        (::candidate-mining/source-item naming-candidate)
        naming-definition  (::candidate-mining/query naming-candidate)
        source-name        (when-not (str/blank? (:name source-item))
                             (:name source-item))
        source-description (when-not (str/blank? (:description source-item))
                             (:description source-item))
        suggested-name     (or source-name
                               (when naming-definition
                                 (candidate-suggestions/safe-display-name
                                  naming-definition
                                  (first (lib/aggregations naming-definition 0))
                                  (tru "Metric")))
                               (tru "Metric"))
        description        (or source-description
                               (when naming-definition
                                 (metric-fallback-description naming-definition suggested-name))
                               suggested-name)]
    (assoc candidate
           :suggested-name (u.str/elide suggested-name candidate-suggestions/candidate-name-max-length)
           :suggested-description description)))

(defn- merge-metric-candidates
  [raw-candidates existing-signatures table-index]
  (->> raw-candidates
       (remove #(contains? existing-signatures (::candidate-mining/signature %)))
       (group-by ::candidate-mining/signature)
       (keep (fn [[signature candidates]]
               (let [candidate        (first candidates)
                     table-ids        (::candidate-mining/table-ids candidate)
                     required-tables  (->> table-ids (keep table-index) (sort-by required-table-sort-key) vec)
                     naming-candidate (first (sort-by metric-source-sort-key candidates))]
                 (when (= (count table-ids) (count required-tables))
                   (-> candidate
                       (assoc :required-tables required-tables
                              :evidence (candidate-mining/candidate-evidence (map ::candidate-mining/source-item candidates))
                              ::candidate-mining/signature signature)
                       (metric-suggestions naming-candidate)
                       (dissoc ::candidate-mining/source-item ::candidate-mining/query ::candidate-mining/table-ids))))))
       (sort-by metric-candidate-sort-key)
       (mapv #(dissoc % ::candidate-mining/signature))))

(mu/defn candidate-metric-observations :- [:sequential ::usage-metadata.schema/candidate-metric]
  "Return every creation-ready Metric Card observation from selected questions and models.

  This unbounded producer is intended for persistence. Call [[candidate-metrics]] for a ranked,
  presentation-sized result. `:limit` is deliberately ignored so cross-batch evidence remains complete."
  ([] (candidate-metric-observations {}))
  ([opts :- ::usage-metadata.schema/candidate-opts]
   (lib-be/with-metadata-provider-cache
     (let [cards               (candidate-mining/candidate-source-cards (dissoc opts :limit))
           card-index          (candidate-mining/candidate-lineage-card-index cards)
           raw-candidates      (raw-metric-candidates cards card-index)
           existing-signatures (existing-metric-definition-signatures)
           table-index         (metric-required-table-index (into #{} (mapcat ::candidate-mining/table-ids) raw-candidates))]
       (merge-metric-candidates raw-candidates existing-signatures table-index)))))

(mu/defn candidate-metrics :- [:sequential ::usage-metadata.schema/candidate-metric]
  "Creation-ready Metric Card candidates mined from selected questions and models.

  V1 promotes only whole, single-stage MBQL queries that already have one aggregation and at most one
  temporal breakout. Plain Measure-shaped aggregations are excluded. Projection-only saved-Card chains
  are rewritten to physical tables; opaque Card dependencies, saved Measure/Segment references, and
  unpublishable physical table dependencies are rejected. Existing exact Metric definitions are excluded."
  ([] (candidate-metrics {}))
  ([{:keys [limit] :as opts} :- ::usage-metadata.schema/candidate-opts]
   (let [limit (or limit candidate-mining/candidate-default-limit)]
     (->> (candidate-metric-observations opts)
          (take limit)
          vec))))

(defn- assemble-candidates
  [raw-candidates source-index existing-signatures candidate-type keep-candidate?]
  (->> raw-candidates
       (remove #(contains? existing-signatures (::candidate-mining/signature %)))
       (group-by ::candidate-mining/signature)
       (keep (fn [[signature candidates]]
               (let [candidate (first candidates)]
                 (when-let [source (source-index [:table (::candidate-mining/table-id candidate)])]
                   (let [candidate (cond-> (-> candidate
                                               (assoc :source source
                                                      :evidence (candidate-mining/candidate-evidence
                                                                 (map ::candidate-mining/source-item candidates))
                                                      ::candidate-mining/signature signature)
                                               (dissoc ::candidate-mining/table-id ::candidate-mining/source-item))
                                     candidate-type
                                     (assoc :candidate-type candidate-type
                                            :signature (candidate-mining/canonical-signature signature)))]
                     (when (keep-candidate? candidate)
                       candidate))))))))

(defn- merge-candidates
  ([raw-candidates source-index existing-signatures limit]
   (merge-candidates raw-candidates source-index existing-signatures limit (constantly true)))
  ([raw-candidates source-index existing-signatures limit keep-candidate?]
   (->> (assemble-candidates raw-candidates source-index existing-signatures nil keep-candidate?)
        (sort-by candidate-mining/candidate-sort-key)
        (take limit)
        (mapv #(dissoc % ::candidate-mining/signature)))))

(defn- merge-cleanup-candidates
  [candidate-type raw-candidates source-index keep-candidate?]
  (->> (assemble-candidates raw-candidates source-index #{} candidate-type keep-candidate?)
       (sort-by candidate-mining/candidate-sort-key)
       (mapv #(dissoc % ::candidate-mining/signature))
       vec))

(defn- raw-measure-candidates
  [cards model-index]
  (into []
        (mapcat
         (fn [{:keys [database_id dataset_query] :as card}]
           (for [{:keys [query table-id model-lineage stage-number joined? expressions?]}
                 (candidate-mining/query-stage-contexts database_id dataset_query model-index)
                 :when (and (not joined?) (not expressions?))
                 :let [source-item (assoc card
                                          :model-lineage model-lineage
                                          :stage-number stage-number
                                          :joined? joined?)
                       categorical-predicates
                       (candidate-mining/predicate-candidates
                        (candidate-mining/filter-atoms query stage-number table-id true))]
                 aggregation (lib/aggregations query stage-number)
                 :let [{aggregation-clause :clause
                        aggregation-info   :info}
                       (candidate-mining/simple-aggregation query stage-number aggregation table-id)]
                 :when aggregation-info
                 {:keys [clause info]}
                 (into [{:clause aggregation-clause :info aggregation-info}]
                       (keep #(candidate-mining/conditional-aggregation aggregation-clause aggregation-info %))
                       categorical-predicates)
                 :let [definition (candidate-mining/minimal-definition query table-id :aggregation clause)]
                 :when (mr/validate ::lib.schema.measure/definition definition)]
             {::candidate-mining/signature   [table-id (candidate-mining/canonical-signature clause)]
              ::candidate-mining/table-id    table-id
              ::candidate-mining/source-item source-item
              ::candidate-suggestions/metadata-provider (:lib/metadata query)
              :definition   definition
              :aggregation  info})))
        cards))

(defn- full-segment-predicate
  [definition]
  (when-let [filters (seq (lib/filters definition 0))]
    (if (next filters)
      (lib/simplify-compound-filter (apply lib/and filters))
      (first filters))))

(defn- existing-measure-signatures
  [table-ids]
  (if (seq table-ids)
    (into #{}
          (keep (fn [{:keys [table_id definition]}]
                  (when (and (pos-int? table_id) (seq definition))
                    (try
                      (let [aggregations (lib/aggregations definition 0)]
                        (when (= 1 (count aggregations))
                          [table_id (candidate-mining/canonical-signature (first aggregations))]))
                      (catch InterruptedException e
                        (.interrupt (Thread/currentThread))
                        (throw e))
                      (catch Exception e
                        (log/debug e "Failed to read an existing Measure definition")
                        nil)))))
          (t2/select [:model/Measure :table_id :definition]
                     :archived false
                     :table_id [:in table-ids]))
    #{}))

(defn- existing-segment-signatures
  [table-ids]
  (if (seq table-ids)
    (into #{}
          (keep (fn [{:keys [table_id definition]}]
                  (when (and (pos-int? table_id) (seq definition))
                    (try
                      (when-let [predicate (full-segment-predicate definition)]
                        (let [atoms (lib/atomic-filters
                                     (candidate-mining/minimal-definition definition table_id :filters predicate)
                                     0)]
                          (when (seq atoms)
                            (candidate-mining/segment-signature table_id atoms))))
                      (catch InterruptedException e
                        (.interrupt (Thread/currentThread))
                        (throw e))
                      (catch Exception e
                        (log/debug e "Failed to read an existing Segment definition")
                        nil)))))
          (t2/select [:model/Segment :table_id :definition]
                     :archived false
                     :table_id [:in table-ids]))
    #{}))

(defn- raw-segment-candidates
  [cards model-index]
  (into []
        (mapcat
         (fn [{:keys [database_id dataset_query] :as card}]
           (for [{:keys [query model-lineage stage-number joined? expressions?]}
                 (candidate-mining/query-stage-contexts database_id dataset_query model-index)
                 :when (not expressions?)
                 [table-id atoms] (group-by :table-id
                                            (candidate-mining/filter-atoms query stage-number nil false))
                 :let [source-item (assoc card
                                          :model-lineage model-lineage
                                          :stage-number stage-number
                                          :joined? joined?)]
                 {:keys [predicate predicates columns]} (candidate-mining/predicate-candidates atoms)
                 :let [definition (candidate-mining/minimal-segment-definition query table-id predicates)]
                 :when (mr/validate ::lib.schema/query definition)]
             {::candidate-mining/signature   (candidate-mining/segment-signature table-id predicates)
              ::candidate-mining/table-id    table-id
              ::candidate-mining/source-item source-item
              ::candidate-suggestions/metadata-provider (:lib/metadata query)
              :definition   definition
              :predicate    predicate
              :fields       (mapv candidate-mining/field-summary columns)
              :composite?   (> (count predicates) 1)
              :atom-count   (count predicates)})))
        cards))

(defn- eligible-segment-candidate?
  [{:keys [composite? evidence]}]
  (or (not composite?)
      (pos? (:verified-source-count evidence))
      (pos? (:official-source-count evidence))
      (>= (:distinct-source-count evidence) 2)))

(defn- eligible-measure-candidate?
  [{:keys [aggregation evidence]}]
  (and
   ;; A bare count(*) is useful evidence that a table is commonly counted, but it does not carry enough
   ;; reusable semantics to justify a standalone Measure candidate. Keep count(field) and the conditional
   ;; count-where synthesized from this raw aggregation.
   (not (and (= :count (:type aggregation))
             (nil? (:field aggregation))))
   (or (not (contains? candidate-mining/conditional-aggregation-operators (:type aggregation)))
       (pos? (:verified-source-count evidence))
       (pos? (:official-source-count evidence))
       (>= (:distinct-source-count evidence) 2))))

(defn cleanup-candidates
  "Return reconciliation-ready Measure and Segment observations for persistence.

  Unlike `candidate-measures` and `candidate-segments`, exact existing Library definitions are
  deliberately retained. This is an internal materialization boundary: callers receive stable
  semantic signatures and the same eligibility, evidence, naming, and ordering used by the public
  candidate APIs."
  ([] (cleanup-candidates {}))
  ([{:keys [include-ineligible?] :as opts}]
   (lib-be/with-metadata-provider-cache
     (let [cards        (candidate-mining/candidate-source-cards opts)
           models       (candidate-mining/candidate-model-index cards)
           raw-measures (raw-measure-candidates cards models)
           raw-segments (raw-segment-candidates cards models)
           source-idx   (candidate-mining/build-source-index
                         (into #{}
                               (map (comp #(vector :table %) ::candidate-mining/table-id))
                               (concat raw-measures raw-segments)))
           measure-keep (if include-ineligible? (constantly true) eligible-measure-candidate?)
           segment-keep (if include-ineligible? (constantly true) eligible-segment-candidate?)
           measures     (merge-cleanup-candidates :measure raw-measures source-idx measure-keep)
           segments     (merge-cleanup-candidates :segment raw-segments source-idx segment-keep)]
       {:measures (mapv candidate-suggestions/add-measure-suggestions measures)
        :segments (mapv candidate-suggestions/add-segment-suggestions segments)}))))

(mu/defn candidate-measures :- [:sequential ::usage-metadata.schema/candidate-measure]
  "Creation-ready Measure candidates mined from selected questions and models.

  `:query-source`, when supplied, controls which saved queries are analyzed. Otherwise a source qualifies
  when it is verified, directly in an official collection, or has at least `:min-view-count` lifetime views.
  Primitive aggregations over one physical-table field are considered.
  Bare row counts seed conditional count Measures but are not returned as standalone candidates.
  Conditional count/distinct/sum Measures are synthesized from categorical filter subsets and retained
  when curated or recurring. Every eligible stage is inspected until a
  non-projection stage forms a lineage barrier. Native queries, joined stages, expressions,
  non-transparent model sources, and existing semantically equivalent Measures are skipped. Each result
  includes a deterministic suggested name and description derived from Lib's query display names."
  ([] (candidate-measures {}))
  ([{:keys [limit] :as opts} :- ::usage-metadata.schema/candidate-opts]
   (lib-be/with-metadata-provider-cache
     (let [limit      (or limit candidate-mining/candidate-default-limit)
           cards      (candidate-mining/candidate-source-cards opts)
           models     (candidate-mining/candidate-model-index cards)
           candidates (raw-measure-candidates cards models)
           source-idx (candidate-mining/build-source-index
                       (into #{} (map (comp #(vector :table %) ::candidate-mining/table-id)) candidates))]
       (mapv candidate-suggestions/add-measure-suggestions
             (merge-candidates candidates
                               source-idx
                               (existing-measure-signatures (into #{} (map ::candidate-mining/table-id) candidates))
                               limit
                               eligible-measure-candidate?))))))

(mu/defn candidate-segments :- [:sequential ::usage-metadata.schema/candidate-segment]
  "Creation-ready Segment candidates mined from selected questions and models.

  `:query-source`, when supplied, controls which saved queries are analyzed. Otherwise verified,
  official-collection, or popular questions and models are analyzed. Each eligible direct-table filter
  becomes an atomic candidate. Queries with two to five eligible
  atoms also contribute every multi-atom subset. A composite is retained when it recurs across at
  least two source Cards or has verified/official evidence. Existing exact Segment definitions are
  skipped without allowing a saved conjunction to suppress its atomic constituents. Questions and
  models sourced through projection-only MBQL model chains are attributed to the physical source
  table. Multi-stage lineage is followed through projection-only stages, and filters from joined
  stages are attributed only when every field in the filter belongs to one physical table. Each
  result includes a deterministic suggested name and description derived from Lib's filter display
  names."
  ([] (candidate-segments {}))
  ([{:keys [limit] :as opts} :- ::usage-metadata.schema/candidate-opts]
   (lib-be/with-metadata-provider-cache
     (let [limit       (or limit candidate-mining/candidate-default-limit)
           cards       (candidate-mining/candidate-source-cards opts)
           models      (candidate-mining/candidate-model-index cards)
           candidates  (raw-segment-candidates cards models)
           source-idx  (candidate-mining/build-source-index
                        (into #{} (map (comp #(vector :table %) ::candidate-mining/table-id)) candidates))]
       (mapv candidate-suggestions/add-segment-suggestions
             (merge-candidates candidates
                               source-idx
                               (existing-segment-signatures (into #{} (map ::candidate-mining/table-id) candidates))
                               limit
                               eligible-segment-candidate?))))))
