(ns metabase-enterprise.content-diagnostics.db
  "Application database queries for the Content Diagnostics module. Every function here is a direct
  Toucan 2 call with no additional logic, so the rest of the module only touches `toucan2.core` for the
  model definition, hydration and transactions.

  Nothing module-internal is required here: `common` holds the entity-type → model mapping and the
  shared WHERE fragments, and its own queries route through this namespace, so callers pass the model
  and any prebuilt fragment in as arguments."
  (:require
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Findings -------------------------------------------------

(mu/defn insert-findings!
  "Insert one chunk of `content_diagnostics_finding` `rows`."
  [rows :- [:sequential :map]]
  (t2/insert! :model/ContentDiagnosticsFinding rows))

(mu/defn invalidate-superseded!
  "Stamp `invalidated_at` on every still-active finding of `finding-types` left by a scan other than
  `scan-id`; returns the row count."
  [scan-id       :- :string
   finding-types :- [:set :keyword]]
  (t2/update! :model/ContentDiagnosticsFinding
              {:scan_id        [:not= scan-id]
               :finding_type   [:in finding-types]
               :invalidated_at nil}
              {:invalidated_at (mi/now)}))

(mu/defn invalidate-for-entity!
  "Stamp `invalidated_at` on one entity's still-active findings; returns the row count."
  [entity-type :- :keyword
   entity-id   :- ms/PositiveInt]
  (t2/update! :model/ContentDiagnosticsFinding
              {:entity_type    entity-type
               :entity_id      entity-id
               :invalidated_at nil}
              {:invalidated_at (mi/now)}))

(mu/defn invalidate-findings-where!
  "Stamp `invalidated_at` on every finding matching `where`; returns the row count."
  [where :- vector?]
  (t2/query-one {:update (t2/table-name :model/ContentDiagnosticsFinding)
                 :set    {:invalidated_at (mi/now)}
                 :where  where}))

(mu/defn findings-page
  "One page of findings matching `where`, sorted by `order-by`; `limit`/`offset` may be nil for no
  restriction."
  [where    :- vector?
   order-by :- vector?
   limit    :- [:maybe ms/PositiveInt]
   offset   :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/ContentDiagnosticsFinding
             (m/assoc-some {:where where, :order-by order-by} :limit limit :offset offset)))

(mu/defn finding-count
  "The number of findings matching `where`."
  [where :- vector?]
  (t2/count :model/ContentDiagnosticsFinding {:where where}))

(mu/defn last-detected-at
  "The `detected_at` of the most recent finding overall (≈ the latest scan's time), or nil if there are
  none."
  []
  (t2/select-one-fn :detected_at :model/ContentDiagnosticsFinding {:order-by [[:detected_at :desc]]}))

(defn- delete-batch-query
  "Honey SQL deleting up to `batch-size` findings invalidated before `cutoff` on `db-type`. MySQL rejects
  a subquery reading the table being deleted from (error 1093), so it gets `DELETE ... LIMIT` instead.
  Every app DB `mdb/spec` supports needs an arm here; `finding-test` fails when one is missing."
  [db-type cutoff batch-size]
  (let [table (t2/table-name :model/ContentDiagnosticsFinding)]
    (case db-type
      (:postgres :h2)
      {:delete-from table
       :where       [:in :id ^:allow-subquery {:select   [:id]
                                               :from     [table]
                                               :where    [:< :invalidated_at cutoff]
                                               :order-by [[:id :asc]]
                                               :limit    batch-size}]}

      :mysql
      {:delete-from table
       :where       [:< :invalidated_at cutoff]
       :order-by    [[:id :asc]]
       :limit       batch-size})))

(mu/defn delete-invalidated-batch!
  "Delete up to `batch-size` findings invalidated before `cutoff`; returns the row count."
  [cutoff     :- ms/TemporalInstant
   batch-size :- ms/PositiveInt]
  (t2/query-one (delete-batch-query (mdb/db-type) cutoff batch-size)))

;;; ----------------------------------------------- Collections -----------------------------------------------

(mu/defn collection-ids
  "The ids of the Collections matching `where`."
  [where :- vector?]
  (t2/select-pks-set :model/Collection {:where where}))

(mu/defn collection-locations
  "The `(id, location)` rows of the Collections matching `where`."
  [where :- vector?]
  (t2/select [:model/Collection :id :location] {:where where}))

(mu/defn collections
  "The whole Collection rows matching `where` - the breadcrumb hydrate needs `:location`."
  [where :- vector?]
  (t2/select :model/Collection {:where where}))

(mu/defn collection-context-rows
  "The display context of the Collections with `collection-ids`: `description`, the `location` their
  breadcrumb anchor is parsed from, `personal_owner_id`, and the tree's `namespace`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select [:model/Collection :id :description :location :personal_owner_id :namespace]
             :id [:in collection-ids]))

(mu/defn personal-collection-root-ids
  "The ids of every personal collection - the roots the descendant `location` match starts from."
  []
  (t2/select-pks-vec :model/Collection :personal_owner_id [:not= nil]))

(mu/defn collection-names-by-id
  "`{id → name}` for the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select-pk->fn :name [:model/Collection :id :name] :id [:in collection-ids]))

(mu/defn collection-namespaces-by-id
  "`{id → namespace}` for the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select-pk->fn :namespace [:model/Collection :id :namespace] :id [:in collection-ids]))

(mu/defn collection-parent-ids-by-id
  "`{id → parent collection id}` for the Collections with `collection-ids`, parsed from `location`; nil
  for a collection at the root of its tree."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select-pk->fn (comp collection/location-path->parent-id :location)
                    [:model/Collection :id :location]
                    :id [:in collection-ids]))

;;; --------------------------------------------- Entities of a type ------------------------------------------

(mu/defn collection-ids-by-entity-id
  "`{id → collection_id}` for the rows of `model` with `ids`."
  [model :- :keyword
   ids   :- [:set ms/PositiveInt]]
  (t2/select-pk->fn :collection_id [model :id :collection_id] :id [:in ids]))

(mu/defn entity-attrs-by-id
  "`{id → {:name :created_at :creator_id :type}}` for the rows of `model` with `ids`.
  `select-cols` is the whole projection - the subset of those columns the model actually has, `:id`,
  and whatever its after-select hook requires."
  [model       :- :keyword
   select-cols :- [:maybe [:sequential :keyword]]
   ids         :- [:set ms/PositiveInt]]
  (t2/select-pk->fn #(select-keys % [:name :created_at :creator_id :type])
                    (into [model] select-cols)
                    :id [:in ids]))

(mu/defn entity-context-rows
  "The `(id, collection_id)` rows of `model` with `ids`, plus the `extra-cols` its display context
  needs."
  [model      :- :keyword
   extra-cols :- [:maybe [:sequential :keyword]]
   ids        :- [:set ms/PositiveInt]]
  (t2/select (into [model :id :collection_id] extra-cols) :id [:in ids]))

(mu/defn entity-rows
  "The rows of `selectable` - a model, or a model with a column projection - with `ids`."
  [selectable :- [:or :keyword vector?]
   ids        :- [:set ms/PositiveInt]]
  (t2/select selectable :id [:in ids]))

(mu/defn document-owned-card-ids
  "The ids of every Card a Document owns."
  []
  (t2/select-pks-set [:model/Card :id] {:where [:not= :document_id nil]}))

;;; -------------------------------------------------- Users --------------------------------------------------

(mu/defn user-names-by-id
  "`{id → common_name}` for the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  ;; the projection is what `add-common-name` reads - a bare model select would fetch every user
  ;; column to derive one field
  (t2/select-pk->fn :common_name [:model/User :id :email :first_name :last_name]
                    :id [:in user-ids]))

(mu/defn user-contacts-by-id
  "`{id → {:id :common_name :email}}` for the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn #(select-keys % [:id :common_name :email])
                    [:model/User :id :email :first_name :last_name]
                    :id [:in user-ids]))

;;; -------------------------------------------------- Cards --------------------------------------------------

(mu/defn name-rows
  "The `(id, name)` rows of `model` matching `where` (every row when nil), plus `extra-cols` - the
  projection a caller needs on top of the name, such as the `:card_schema` every Card select requires."
  [model      :- :keyword
   extra-cols :- [:maybe [:sequential :keyword]]
   where      :- [:maybe vector?]]
  (t2/select (into [model :id :name] extra-cols) (m/assoc-some {} :where where)))

(mu/defn card-summaries-by-id
  "`{id → {:id :name :entity_type :card_type :view_count}}` for the Cards matching `where` - the
  columns a `slow` roll-up's culprit list serves: `name`, the `type` enum driving the per-member
  link/icon, and the live `view_count`. `:card_schema` is required on any Card select - its
  after-select schema-upgrade hook reads it."
  [where :- vector?]
  (t2/select-pk->fn (fn [c] {:id          (:id c)
                             :name        (:name c)
                             :entity_type :card
                             :card_type   (:type c)
                             :view_count  (:view_count c)})
                    [:model/Card :id :name :type :view_count :card_schema]
                    {:where where}))

(mu/defn collection-item-card-rows
  "The `(id, collection_id)` rows of the non-archived Cards that are direct collection items - a card
  owned by a dashboard or a document lives in that container, not in the collection - in the containers
  `eligible-clause` allows."
  [eligible-clause :- vector?]
  (t2/query {:select [:id :collection_id]
             :from   [:report_card]
             :where  [:and
                      [:= :archived false]
                      [:= :dashboard_id nil]
                      [:= :document_id nil]
                      eligible-clause]}))

(mu/defn cards-with-empty-latest-run
  "The `(card_id, started_at)` rows of the non-archived Cards in the containers `eligible-clause` allows
  whose latest *clean* run returned zero rows. Clean means unparameterized, unsandboxed, not a cache hit
  and error-free; `parameterized` is matched strictly against `false`, so legacy rows predating these
  columns (NULL) fall out, and a NULL `is_sandboxed` is treated as not sandboxed."
  [eligible-clause :- vector?]
  (t2/query {:select [:card_id :started_at]
             :from   [[^:allow-subquery
                       {:select [:qe.card_id :qe.started_at :qe.result_rows
                                 [[:over [[:row_number] ^:allow-subquery
                                          {:partition-by :qe.card_id
                                           :order-by     [[:qe.started_at :desc]
                                                          [:qe.id :desc]]}]]
                                  :rn]]
                        :from   [[:query_execution :qe]]
                        :join   [[:report_card :c] [:= :c.id :qe.card_id]]
                        :where  [:and
                                 [:= :c.archived false]
                                 [:= :qe.parameterized false]
                                 [:= [:coalesce :qe.is_sandboxed false] false]
                                 [:not= :qe.cache_hit true]
                                 [:= :qe.error nil]
                                 eligible-clause]}
                       :ranked]]
             :where  [:and [:= :rn 1] [:= :result_rows 0]]}))

(mu/defn card-run-medians
  "The `(card_id, median_ms)` rows of the non-archived Cards in the containers `eligible-clause` allows
  whose median `running_time` over their non-cache-hit executions since `cutoff` exceeds `threshold-ms`.
  The app DBs share no median aggregate (H2 has MEDIAN, Postgres percentile_cont, MySQL neither), so it
  is computed portably: rank each card's executions by `running_time`, keep the middle row (odd count)
  or middle two (even), and AVG them. `median_ms` comes back as a BigDecimal."
  [threshold-ms    :- ms/PositiveInt
   cutoff          :- ms/TemporalInstant
   eligible-clause :- vector?]
  (t2/query {:select   [:card_id [[:avg :running_time] :median_ms]]
             :from     [[^:allow-subquery
                         {:select [:qe.card_id :qe.running_time
                                   [[:over [[:row_number] ^:allow-subquery
                                            {:partition-by :qe.card_id
                                             :order-by     [[:qe.running_time :asc]]}]]
                                    :rn]
                                   [[:over [[:count :*] ^:allow-subquery {:partition-by :qe.card_id}]] :cnt]]
                          :from   [[:query_execution :qe]]
                          :join   [[:report_card :c] [:= :c.id :qe.card_id]]
                          :where  [:and
                                   [:not= :qe.running_time nil]
                                   [:not= :qe.cache_hit true]
                                   [:= :c.archived false]
                                   [:>= :qe.started_at cutoff]
                                   eligible-clause]}
                         :ranked]]
             :where    [:and
                        [:>= :rn [:/ :cnt 2.0]]
                        [:<= :rn [:+ [:/ :cnt 2.0] 1]]]
             :group-by [:card_id]
             :having   [:> [:avg :running_time] threshold-ms]}))

;;; ------------------------------------------------ Dashboards -----------------------------------------------

(mu/defn active-dashboard-rows
  "The `(id, collection_id)` rows of the non-archived Dashboards in the containers `eligible-clause`
  allows."
  [eligible-clause :- vector?]
  (t2/query {:select [:id :collection_id]
             :from   [:report_dashboard]
             :where  [:and [:= :archived false] eligible-clause]}))

(mu/defn dashboard-dashcard-counts
  "The `(dashboard_id, cnt)` primary-dashcard count of every Dashboard that has one; no row means zero.
  A series card layers onto another dashcard without taking a layout slot of its own, so it is not
  counted."
  []
  (t2/query {:select   [:dashboard_id [[:count :*] :cnt]]
             :from     [:report_dashboardcard]
             :group-by [:dashboard_id]}))

(mu/defn dashboard-tab-dashcard-counts
  "The `(dashboard_id, dashboard_tab_id, cnt)` primary-dashcard counts, one row per tab."
  []
  (t2/query {:select   [:dashboard_id :dashboard_tab_id [[:count :*] :cnt]]
             :from     [:report_dashboardcard]
             :group-by [:dashboard_id :dashboard_tab_id]}))

(mu/defn dashboard-tab-counts
  "The `(dashboard_id, cnt)` tab count of every Dashboard that has tabs; no row means a tabless
  dashboard."
  []
  (t2/query {:select   [:dashboard_id [[:count :*] :cnt]]
             :from     [:dashboard_tab]
             :group-by [:dashboard_id]}))

(mu/defn dashboard-primary-card-pairs
  "The `(dashboard_id, card_id)` pairs where a Dashboard matching `eligible-clause` renders one of
  `card-ids` as a primary dashcard. A card on several tabs yields several rows."
  [eligible-clause :- vector?
   card-ids        :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select [[:dc.dashboard_id :dashboard_id] [:dc.card_id :card_id]]
             :from   [[:report_dashboardcard :dc]]
             :join   [[:report_dashboard :d] [:= :d.id :dc.dashboard_id]]
             :where  [:and eligible-clause [:in :dc.card_id card-ids]]}))

(mu/defn dashboard-series-card-pairs
  "The `(dashboard_id, card_id)` pairs where a Dashboard matching `eligible-clause` renders one of
  `card-ids` as a combined-series card layered onto a dashcard."
  [eligible-clause :- vector?
   card-ids        :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select [[:dc.dashboard_id :dashboard_id] [:s.card_id :card_id]]
             :from   [[:dashboardcard_series :s]]
             :join   [[:report_dashboardcard :dc] [:= :dc.id :s.dashboardcard_id]
                      [:report_dashboard :d]      [:= :d.id :dc.dashboard_id]]
             :where  [:and eligible-clause [:in :s.card_id card-ids]]}))

;;; ------------------------------------------------- Documents -----------------------------------------------

(mu/defn document-rows
  "The `(id, collection_id)` rows of the non-archived Documents in the containers `eligible-clause`
  allows - the light form, with no AST."
  [eligible-clause :- vector?]
  (t2/query {:select [:id :collection_id]
             :from   [(t2/table-name :model/Document)]
             :where  [:and [:= :archived false] eligible-clause]}))

(mu/defn active-document-rows
  "The non-archived Documents in the containers `eligible-clause` allows, with the `:document` AST the
  content verdicts parse."
  [eligible-clause :- vector?]
  (t2/select [:model/Document :id :collection_id :document :content_type]
             {:where [:and [:= :archived false] eligible-clause]}))

(mu/defn documents-of-content-type
  "The non-archived Documents of `content-type` in the containers `eligible-clause` allows, with the
  `:document` AST their embedded card ids are parsed from."
  [content-type    :- :string
   eligible-clause :- vector?]
  (t2/select [:model/Document :id :document :content_type]
             {:where [:and
                      [:= :archived false]
                      [:= :content_type content-type]
                      eligible-clause]}))

;;; ------------------------------------------------- Transforms ----------------------------------------------

(mu/defn transform-rows
  "The `(id, collection_id)` rows of every Transform - transforms are hard-deleted, so there is no
  `archived` column to filter on."
  []
  (t2/query {:select [:id :collection_id]
             :from   [:transform]}))

(mu/defn transforms
  "The whole Transform rows matching `where` - `mi/can-read?` reads `:source`, so the caller needs them
  all."
  [where :- vector?]
  (t2/select :model/Transform {:where where}))

(mu/defn finished-transform-run-spans
  "The `(transform_id, start_time, end_time)` of each Transform's latest finished run - succeeded, failed
  or timed out, started at or after `cutoff`. Canceled runs are excluded: their duration measures when
  someone hit cancel, not the transform. Runs per transform are serialized
  (`idx_unique_active_transform_run` allows one active run at a time), so the MAX of each timestamp
  belongs to the same (latest) row - one grouped query, no fetch of the full run history."
  [cutoff :- ms/TemporalInstant]
  (t2/query {:select   [:transform_id
                        [[:max :start_time] :start_time]
                        [[:max :end_time] :end_time]]
             :from     [:transform_run]
             :where    [:and
                        [:in :status ["succeeded" "failed" "timeout"]]
                        [:>= :start_time cutoff]]
             :group-by [:transform_id]}))
