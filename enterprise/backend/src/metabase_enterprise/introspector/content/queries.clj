(ns metabase-enterprise.introspector.content.queries
  "Federated SQL queries for the admin Introspector. Each entity-type query produces rows
  with `is_stale`, `is_broken`, `is_unreferenced` flags so the UI can render multi-badge rows
  and sort/paginate across condition types in one round-trip.

  Condition semantics:
  - stale        — `last_used_at` / `last_viewed_at` older than the cutoff, AND not load-bearing
                   (no subscriptions, sandboxes, verified moderation, embedding, public sharing).
                   Matches `metabase-enterprise.stale.impl/find-stale-query`. See the TODO below
                   about factoring with that module.
  - broken       — has a row in `analysis_finding` with `result = false`. Same source of truth as
                   `/api/ee/dependencies/graph/broken`.
  - unreferenced — nothing in the `dependency` table points at this entity (`to_entity_*`).

  POC: stale exclusion rules are inlined here rather than reused from
  `metabase-enterprise.stale.impl`. Factor when productizing."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.time Duration LocalDateTime OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

;;; -------------------------------------- helpers --------------------------------------

(defn- card-stale-cte
  "Inner query producing the set of `report_card.id`s that are stale, given a cutoff date.
  Mirrors the WHERE clause of `metabase-enterprise.stale.impl/find-stale-query :model/Card`."
  [^java.time.LocalDate cutoff-date]
  {:select [[:report_card.id :id]]
   :from   [:report_card]
   :left-join [:moderation_review [:and
                                   [:= :moderation_review.moderated_item_id :report_card.id]
                                   [:= :moderation_review.moderated_item_type (h2x/literal "card")]
                                   [:= :moderation_review.most_recent true]
                                   [:= :moderation_review.status (h2x/literal "verified")]]
               :pulse_card        [:= :pulse_card.card_id :report_card.id]
               :pulse             [:and
                                   [:= :pulse_card.pulse_id :pulse.id]
                                   [:= :pulse.archived false]]
               :sandboxes         [:= :sandboxes.card_id :report_card.id]
               :collection        [:= :collection.id :report_card.collection_id]]
   :where  [:and
            [:= :sandboxes.id nil]
            [:= :pulse.id nil]
            [:= :moderation_review.id nil]
            [:= :report_card.archived false]
            [:<= :report_card.last_used_at cutoff-date]
            [:= :collection.type nil]]})

(defn- dashboard-stale-cte
  [^java.time.LocalDate cutoff-date]
  {:select [[:report_dashboard.id :id]]
   :from   [:report_dashboard]
   :left-join [:pulse              [:and
                                    [:= :pulse.archived false]
                                    [:= :pulse.dashboard_id :report_dashboard.id]]
               :collection         [:= :collection.id :report_dashboard.collection_id]
               :moderation_review  [:and
                                    [:= :moderation_review.moderated_item_id :report_dashboard.id]
                                    [:= :moderation_review.moderated_item_type (h2x/literal "dashboard")]
                                    [:= :moderation_review.most_recent true]
                                    [:= :moderation_review.status (h2x/literal "verified")]]]
   :where  [:and
            [:= :pulse.id nil]
            [:= :moderation_review.id nil]
            [:= :report_dashboard.archived false]
            [:<= :report_dashboard.last_viewed_at cutoff-date]
            [:= :collection.type nil]]})

(defn- broken-ids-cte
  "Ids of entities with a failed analysis finding (analyzed_entity_type = entity-type-str)."
  [entity-type-str]
  {:select [[:analyzed_entity_id :id]]
   :from   [:analysis_finding]
   :where  [:and
            [:= :analyzed_entity_type (h2x/literal entity-type-str)]
            [:= :result false]]})

(defn- unreferenced-cards-cte []
  {:select-distinct [[:report_card.id :id]]
   :from   [:report_card]
   :left-join [:dependency [:and
                            [:= :dependency.to_entity_id :report_card.id]
                            [:= :dependency.to_entity_type (h2x/literal "card")]]]
   :where  [:and
            [:= :report_card.archived false]
            [:= :dependency.id nil]]})

(defn- unreferenced-dashboards-cte []
  {:select-distinct [[:report_dashboard.id :id]]
   :from   [:report_dashboard]
   :left-join [:dependency [:and
                            [:= :dependency.to_entity_id :report_dashboard.id]
                            [:= :dependency.to_entity_type (h2x/literal "dashboard")]]]
   :where  [:and
            [:= :report_dashboard.archived false]
            [:= :dependency.id nil]]})

(defn- unreferenced-transforms-cte
  "A transform is unreferenced when no `dependency` row points at either the transform itself
  or its `target_table_id`. Broader than the card/dashboard equivalents because consumers of
  a transform's output table show up as edges on the table, not the transform."
  []
  {:select-distinct [[:transform.id :id]]
   :from   [:transform]
   :left-join [[:dependency :dep_xform]
               [:and
                [:= :dep_xform.to_entity_id :transform.id]
                [:= :dep_xform.to_entity_type (h2x/literal "transform")]]
               [:dependency :dep_table]
               [:and
                [:not= :transform.target_table_id nil]
                [:= :dep_table.to_entity_id :transform.target_table_id]
                [:= :dep_table.to_entity_type (h2x/literal "table")]]]
   :where  [:and
            [:= :dep_xform.id nil]
            [:= :dep_table.id nil]]})

(defn- transform-target-missing-cte
  "Transforms whose `target_table_id` is set but the referenced `metabase_table` row is
  inactive — the warehouse table was dropped externally or removed from sync."
  []
  {:select [[:transform.id :id]]
   :from   [:transform]
   :join   [:metabase_table [:= :metabase_table.id :transform.target_table_id]]
   :where  [:and
            [:not= :transform.target_table_id nil]
            [:= :metabase_table.active false]]})

(defn- transform-latest-failed-cte
  "Transforms whose most recent finished run (`is_active IS NULL`) ended in `:failed` status.
  Captures Python and SQL runtime errors that surface only at execution time.

  Uses a derived table rather than a `WITH` clause so the result composes inside a
  `UNION ALL` (some dialects, including H2, reject `WITH ... SELECT` as a UNION arm)."
  []
  {:select-distinct [[:fr.transform_id :id]]
   :from   [[{:select [:transform_id :status
                       [[:over [[:row_number]
                                {:partition-by :transform_id
                                 :order-by     [[:start_time :desc]]}]]
                        :rn]]
              :from   [:transform_run]
              :where  [:= :is_active nil]}
             :fr]]
   :where  [:and
            [:= :fr.rn [:inline 1]]
            [:= :fr.status (h2x/literal "failed")]]})

(defn- broken-transforms-cte
  "Combined broken signal for transforms: analysis-finding error OR target table missing OR
  latest finished run failed. Matches `docs/developers-guide/transforms-admin-cleanup-spike.md`.

  Uses `:union` (deduplicating) rather than `:union-all` so a transform that trips multiple
  broken signals appears once — keeps the outer LEFT JOIN cardinality-preserving and lets us
  drop the SELECT DISTINCT that H2 rejects when combined with `ORDER BY LOWER(name)`."
  []
  {:union [(broken-ids-cte "transform")
           (transform-target-missing-cte)
           (transform-latest-failed-cte)]})

(defn- conditions-filter-clause
  "Given a set of requested conditions (e.g. #{:broken :stale}), return a HoneySQL clause
  that requires at least one of them to be present on the row."
  [conditions]
  (let [parts (cond-> []
                (contains? conditions :stale)        (conj [:not= :stale.id nil])
                (contains? conditions :broken)       (conj [:not= :broken.id nil])
                (contains? conditions :unreferenced) (conj [:not= :unref.id nil]))]
    (if (empty? parts)
      ;; default: any condition
      [:or
       [:not= :stale.id nil]
       [:not= :broken.id nil]
       [:not= :unref.id nil]]
      (into [:or] parts))))

(defn- sort-clause [sort-column sort-direction]
  (let [col (case sort-column
              :name         :%lower.name
              :last_used_at :last_used_at
              :%lower.name)
        dir (case sort-direction
              :desc :desc
              :asc)]
    [[col dir]]))

;;; -------------------------------------- cards --------------------------------------

(defn cards-federated-query
  "Federated query for the Cards tab. Returns rows with the standard introspector shape plus
  `:is_stale`, `:is_broken`, `:is_unreferenced` flags.

  Options:
  - :conditions        — set of #{:stale :broken :unreferenced}; default all
  - :cutoff-date       — LocalDate for stale threshold; default 6 months ago
  - :collection-id     — optional collection scope (recursive)
  - :include-personal? — include personal collections (default false)
  - :search            — case-insensitive name substring
  - :sort-column       — :name | :last_used_at
  - :sort-direction    — :asc | :desc
  - :limit, :offset    — pagination"
  [{:keys [conditions cutoff-date collection-id include-personal? search
           sort-column sort-direction limit offset]
    :or   {conditions     #{:stale :broken :unreferenced}
           sort-column    :name
           sort-direction :asc
           limit          50
           offset         0}}]
  (let [cutoff (or cutoff-date (t/minus (t/local-date) (t/months 6)))]
    (cond-> {:with [[:stale  (card-stale-cte cutoff)]
                    [:broken (broken-ids-cte "card")]
                    [:unref  (unreferenced-cards-cte)]]
             :select [:report_card.id
                      :report_card.name
                      :report_card.description
                      :report_card.collection_id
                      :report_card.dashboard_id
                      :report_card.last_used_at
                      :report_card.display
                      :report_card.type
                      :report_card.archived
                      :report_card.creator_id
                      :report_card.created_at
                      :report_card.updated_at
                      [[:case [:not= :stale.id nil] 1 :else 0] :is_stale]
                      [[:case [:not= :broken.id nil] 1 :else 0] :is_broken]
                      [[:case [:not= :unref.id nil] 1 :else 0] :is_unreferenced]]
             :from   [:report_card]
             :left-join [[:stale :stale]   [:= :stale.id :report_card.id]
                         [:broken :broken] [:= :broken.id :report_card.id]
                         [:unref :unref]   [:= :unref.id :report_card.id]]
             :where  [:and
                      [:= :report_card.archived false]
                      ;; Exclude cards living in an archived/trashed collection.
                      [:or
                       [:= :report_card.collection_id nil]
                       [:not-in :report_card.collection_id
                        {:select [:id]
                         :from   [:collection]
                         :where  [:= :collection.archived true]}]]
                      (conditions-filter-clause conditions)]
             :order-by (sort-clause sort-column sort-direction)
             :limit    limit
             :offset   offset}

      collection-id        (update :where conj [:= :report_card.collection_id collection-id])
      (not include-personal?) (update :where conj
                                      [:or
                                       [:= :report_card.collection_id nil]
                                       [:not-in :report_card.collection_id
                                        {:select [:id]
                                         :from   [:collection]
                                         :where  [:not= :personal_owner_id nil]}]])
      (and search (not (str/blank? search)))
      (update :where conj
              [:like [:lower :report_card.name]
               (str "%" (u/lower-case-en search) "%")]))))

(defn cards-total
  "Total Cards count for the same filter set (without pagination)."
  [opts]
  (-> (cards-federated-query (assoc opts :limit nil :offset nil))
      (dissoc :limit :offset :order-by)
      (assoc :select [[:%count.* :total]])))

(defn fetch-cards
  "Run the federated Cards query and return `{:rows ... :total ...}`."
  [opts]
  {:rows  (t2/query (cards-federated-query opts))
   :total (-> (t2/query (cards-total opts)) first :total)})

;;; ------------------------------------ dashboards ------------------------------------

(defn dashboards-federated-query
  "Federated query for the Dashboards tab. Same shape as `cards-federated-query`, using
  `last_viewed_at` for the stale signal (aliased to `last_used_at` in the response)."
  [{:keys [conditions cutoff-date collection-id include-personal? search
           sort-column sort-direction limit offset]
    :or   {conditions     #{:stale :broken :unreferenced}
           sort-column    :name
           sort-direction :asc
           limit          50
           offset         0}}]
  (let [cutoff (or cutoff-date (t/minus (t/local-date) (t/months 6)))]
    (cond-> {:with [[:stale  (dashboard-stale-cte cutoff)]
                    [:broken (broken-ids-cte "dashboard")]
                    [:unref  (unreferenced-dashboards-cte)]]
             :select [:report_dashboard.id
                      :report_dashboard.name
                      :report_dashboard.description
                      :report_dashboard.collection_id
                      [:report_dashboard.last_viewed_at :last_used_at]
                      :report_dashboard.archived
                      :report_dashboard.creator_id
                      :report_dashboard.created_at
                      :report_dashboard.updated_at
                      [[:case [:not= :stale.id nil] 1 :else 0] :is_stale]
                      [[:case [:not= :broken.id nil] 1 :else 0] :is_broken]
                      [[:case [:not= :unref.id nil] 1 :else 0] :is_unreferenced]]
             :from   [:report_dashboard]
             :left-join [[:stale :stale]   [:= :stale.id :report_dashboard.id]
                         [:broken :broken] [:= :broken.id :report_dashboard.id]
                         [:unref :unref]   [:= :unref.id :report_dashboard.id]]
             :where  [:and
                      [:= :report_dashboard.archived false]
                      ;; Exclude dashboards living in an archived/trashed collection.
                      [:or
                       [:= :report_dashboard.collection_id nil]
                       [:not-in :report_dashboard.collection_id
                        {:select [:id]
                         :from   [:collection]
                         :where  [:= :collection.archived true]}]]
                      (conditions-filter-clause conditions)]
             :order-by (sort-clause sort-column sort-direction)
             :limit    limit
             :offset   offset}

      collection-id        (update :where conj [:= :report_dashboard.collection_id collection-id])
      (not include-personal?) (update :where conj
                                      [:or
                                       [:= :report_dashboard.collection_id nil]
                                       [:not-in :report_dashboard.collection_id
                                        {:select [:id]
                                         :from   [:collection]
                                         :where  [:not= :personal_owner_id nil]}]])
      (and search (not (str/blank? search)))
      (update :where conj
              [:like [:lower :report_dashboard.name]
               (str "%" (u/lower-case-en search) "%")]))))

(defn dashboards-total
  "Total Dashboards count for the same filter set."
  [opts]
  (-> (dashboards-federated-query (assoc opts :limit nil :offset nil))
      (dissoc :limit :offset :order-by)
      (assoc :select [[:%count.* :total]])))

(defn fetch-dashboards
  "Run the federated Dashboards query and return `{:rows ... :total ...}`."
  [opts]
  {:rows  (t2/query (dashboards-federated-query opts))
   :total (-> (t2/query (dashboards-total opts)) first :total)})

;;; ------------------------------------ transforms ------------------------------------
;;
;; Transforms don't have `last_used_at` or `last_viewed_at`. For v1 we surface :broken and
;; :unreferenced only — :stale for transforms is a separate design conversation (probably
;; based on `transform_run.last_run` or "enabled but never ran").

(defn transforms-federated-query
  "Federated query for the Transforms tab. Surfaces `:broken` and `:unreferenced`; `:stale` is
  dropped if requested (transforms have no `last_used_at`).

  Broken signals union analysis-finding errors, missing/inactive target tables, and the most
  recent finished run failing — see `broken-transforms-cte`."
  [{:keys [conditions search sort-column sort-direction limit offset]
    :or   {conditions     #{:broken :unreferenced}
           sort-column    :name
           sort-direction :asc
           limit          50
           offset         0}}]
  (let [conditions (disj conditions :stale)]
    (cond-> {:with [[:broken (broken-transforms-cte)]
                    [:unref  (unreferenced-transforms-cte)]]
             :select [:transform.id
                      :transform.name
                      :transform.description
                      :transform.source_database_id
                      :transform.target_table_id
                      :transform.creator_id
                      :transform.created_at
                      :transform.updated_at
                      ;; Raw JSON; parsed in `attach-transform-extras` to extract :type
                      ;; (query / native / python) for the "Target table" column.
                      [:transform.source :source_json]
                      [[:inline 0] :is_stale]
                      ;; H2 infers the union-of-CTEs `broken.id` as VARCHAR, which then makes
                      ;; the CASE expression return strings ("1"/"0") instead of ints. Cast
                      ;; the result so the wire row shape matches the cards/dashboards rows.
                      [[:cast [:case [:not= :broken.id nil] 1 :else 0] :integer] :is_broken]
                      [[:cast [:case [:not= :unref.id nil] 1 :else 0] :integer] :is_unreferenced]]
             :from   [:transform]
             :left-join [[:broken :broken] [:= :broken.id :transform.id]
                         [:unref :unref]   [:= :unref.id :transform.id]]
             :where  (cond
                       (and (contains? conditions :broken)
                            (contains? conditions :unreferenced))
                       [:or [:not= :broken.id nil] [:not= :unref.id nil]]

                       (contains? conditions :broken)       [:not= :broken.id nil]
                       (contains? conditions :unreferenced) [:not= :unref.id nil]
                       :else
                       [:or [:not= :broken.id nil] [:not= :unref.id nil]])
             :order-by (case sort-column
                         :last_used_at [[:transform.updated_at (or sort-direction :desc)]]
                         [[:%lower.name (or sort-direction :asc)]])
             :limit    limit
             :offset   offset}

      (and search (not (str/blank? search)))
      (update :where conj
              [:like [:lower :transform.name]
               (str "%" (u/lower-case-en search) "%")]))))

(defn- transform-target-tables
  "Map of `transform-id → {:id ... :name ... :schema ... :db_id ... :db_name ... :active ...}`
  for the given transform ids. The db name lets the FE render the `db · type` subtitle in
  the Target-table column without a second roundtrip."
  [transform-ids]
  (when (seq transform-ids)
    (let [rows (t2/query
                {:select [[:t.id :transform_id]
                          [:mt.id :table_id]
                          [:mt.name :table_name]
                          [:mt.schema :schema]
                          [:mt.db_id :db_id]
                          [:mt.active :active]
                          [:db.name :db_name]]
                 :from   [[:transform :t]]
                 :join   [[:metabase_table :mt] [:= :mt.id :t.target_table_id]]
                 :left-join [[:metabase_database :db] [:= :db.id :mt.db_id]]
                 :where  [:and
                          [:in :t.id transform-ids]
                          [:not= :t.target_table_id nil]]})]
      (into {}
            (map (fn [r]
                   [(:transform_id r) {:id      (:table_id r)
                                       :name    (:table_name r)
                                       :schema  (:schema r)
                                       :db_id   (:db_id r)
                                       :db_name (:db_name r)
                                       :active  (:active r)}]))
            rows))))

(defn- transform-creators
  "Map of `transform-id → {:id ... :common_name ...}` for the given transform ids. Uses the
  same fallback logic as `metabase.users.models.user/common-name` (first + last, falling back
  to email when name parts are blank)."
  [transform-ids]
  (when (seq transform-ids)
    (let [rows (t2/query
                {:select [[:t.id :transform_id]
                          [:u.id :user_id]
                          [:u.first_name :first_name]
                          [:u.last_name :last_name]
                          [:u.email :email]]
                 :from   [[:transform :t]]
                 :left-join [[:core_user :u] [:= :u.id :t.creator_id]]
                 :where  [:in :t.id transform-ids]})
          common-name (fn [{:keys [first_name last_name email]}]
                        (let [name (str/trim (str (or first_name "") " " (or last_name "")))]
                          (if (str/blank? name) email name)))]
      (into {}
            (map (fn [r]
                   [(:transform_id r) (when (:user_id r)
                                        {:id          (:user_id r)
                                         :common_name (common-name r)})]))
            rows))))

(defn- transform-dependent-counts
  "Map of `transform-id → integer dependent count`. Counts `dependency` rows whose
  `(to_entity_type, to_entity_id)` points at either the transform itself or its
  `target_table_id`. Matches the spike's stale signal — a transform is stale iff this count
  is zero (and it isn't otherwise broken)."
  [transform-ids]
  (if-not (seq transform-ids)
    {}
    (let [rows (t2/query
                {:with [[:edges
                         {:union-all
                          [{:select [[:t.id :transform_id]]
                            :from   [[:transform :t]]
                            :join   [[:dependency :d]
                                     [:and
                                      [:= :d.to_entity_id :t.id]
                                      [:= :d.to_entity_type (h2x/literal "transform")]]]
                            :where  [:in :t.id transform-ids]}
                           {:select [[:t.id :transform_id]]
                            :from   [[:transform :t]]
                            :join   [[:dependency :d]
                                     [:and
                                      [:not= :t.target_table_id nil]
                                      [:= :d.to_entity_id :t.target_table_id]
                                      [:= :d.to_entity_type (h2x/literal "table")]]]
                            :where  [:in :t.id transform-ids]}]}]]
                 :select   [:transform_id [:%count.* :dep_count]]
                 :from     [:edges]
                 :group-by [:transform_id]})]
      (into {}
            (map (juxt :transform_id (comp long :dep_count)))
            rows))))

(defn- transform-latest-runs
  "Map of `transform-id → latest finished `transform_run` row` for the given transform ids.
  Only considers rows with `is_active IS NULL` (finished — succeeded, failed, canceled,
  timed-out)."
  [transform-ids]
  (when (seq transform-ids)
    (let [rows (t2/query
                {:with [[:finished_runs
                         {:select [:*
                                   [[:over [[:row_number]
                                            {:partition-by :transform_id
                                             :order-by     [[:start_time :desc]]}]]
                                    :rn]]
                          :from   [:transform_run]
                          :where  [:and
                                   [:in :transform_id transform-ids]
                                   [:= :is_active nil]]}]]
                 :select [:transform_id :status :start_time :end_time :message]
                 :from   [:finished_runs]
                 :where  [:= :rn [:inline 1]]})]
      (into {}
            (map (fn [r]
                   (let [^java.time.temporal.Temporal s (:start_time r)
                         ^java.time.temporal.Temporal e (:end_time r)
                         duration-ms (when (and s e)
                                       ;; Both H2 and Postgres return timestamps as Local- or
                                       ;; OffsetDateTime; compute against UTC instants to be
                                       ;; safe across both.
                                       (let [s* (cond
                                                  (instance? OffsetDateTime s) (.toInstant ^OffsetDateTime s)
                                                  (instance? LocalDateTime s)  (.toInstant ^LocalDateTime s ZoneOffset/UTC))
                                             e* (cond
                                                  (instance? OffsetDateTime e) (.toInstant ^OffsetDateTime e)
                                                  (instance? LocalDateTime e)  (.toInstant ^LocalDateTime e ZoneOffset/UTC))]
                                         (when (and s* e*)
                                           (.toMillis (Duration/between s* e*)))))]
                     [(:transform_id r) (-> r
                                            (dissoc :transform_id)
                                            ;; status is stored as a keyword by the model layer;
                                            ;; raw rows come back as strings — normalize.
                                            (update :status (fn [s] (cond-> s (keyword? s) name)))
                                            (assoc :duration_ms duration-ms))])))
            rows))))

(defn- transform-reasons
  "Returns `transform-id → [{:flag :code :detail} …]` for the given broken transform ids.

  Each broken signal contributes 0+ reasons:
  - analysis-finding errors: the message from `analysis_finding_error.message` (one per error
    row, deduplicated by error id).
  - target-table-missing: a single synthetic reason per affected transform.
  - latest-run-failed: a single reason with the run's `message` (truncated by the FE)."
  [transform-ids]
  (if-not (seq transform-ids)
    {}
    (let [ids                 (vec transform-ids)
          ;; `analysis_finding_error` references entities directly via (analyzed_entity_type,
          ;; analyzed_entity_id) — there is no FK back to `analysis_finding`. Combine the
          ;; error rows for this transform into individual reasons.
          analysis-rows       (t2/query
                               {:select [[:afe.analyzed_entity_id :transform_id]
                                         [:afe.error_type :error_type]
                                         [:afe.error_detail :error_detail]]
                                :from   [[:analysis_finding_error :afe]]
                                :where  [:and
                                         [:= :afe.analyzed_entity_type (h2x/literal "transform")]
                                         [:in :afe.analyzed_entity_id ids]]})
          target-missing-rows (t2/query
                               (-> (transform-target-missing-cte)
                                   (update :where conj [:in :transform.id ids])))
          latest-failed-rows  (t2/query
                               {:with   [[:finished_runs
                                          {:select [:transform_id :status :message
                                                    [[:over [[:row_number]
                                                             {:partition-by :transform_id
                                                              :order-by     [[:start_time :desc]]}]]
                                                     :rn]]
                                           :from   [:transform_run]
                                           :where  [:and
                                                    [:in :transform_id ids]
                                                    [:= :is_active nil]]}]]
                                :select [:transform_id :message]
                                :from   [:finished_runs]
                                :where  [:and
                                         [:= :rn [:inline 1]]
                                         [:= :status (h2x/literal "failed")]]})
          push                (fn [m id reason]
                                (update m id (fnil conj []) reason))]
      (as-> {} reasons
        (reduce (fn [m {:keys [transform_id error_type error_detail]}]
                  (let [detail (cond
                                 (and (seq error_type) (seq error_detail))
                                 (str error_type ": " error_detail)
                                 (seq error_type)   error_type
                                 (seq error_detail) error_detail
                                 :else              "Analysis finding reported an error.")]
                    (push m transform_id
                          {:flag   "broken"
                           :code   "analysis-finding-error"
                           :detail detail})))
                reasons analysis-rows)
        (reduce (fn [m {:keys [id]}]
                  (push m id
                        {:flag   "broken"
                         :code   "target-table-missing"
                         :detail "Target table is inactive or has been dropped."}))
                reasons target-missing-rows)
        (reduce (fn [m {:keys [transform_id message]}]
                  (push m transform_id
                        {:flag   "broken"
                         :code   "latest-run-failed"
                         :detail (or message "Most recent run failed.")}))
                reasons latest-failed-rows)))))

(defn- parse-transform-type
  "Read the `:type` out of a transform.source JSON blob. Falls back to nil rather than
  throwing so a malformed row doesn't tank the whole page response."
  [source-json]
  (when (some? source-json)
    (try
      (-> source-json json/decode (get "type"))
      (catch Throwable _ nil))))

(defn- attach-transform-extras
  "Decorate transform rows with the spike's wire shape: `:target_table` (incl. db_name),
  `:last_run` (with `:duration_ms`), `:reasons`, `:creator`, `:dependent_count`,
  `:transform_type` (extracted from `transform.source`), `:flags` array (derived from the
  legacy `is_*` ints so the FE can match `docs/developers-guide/transforms-admin-cleanup-spike.md`
  without a wire-format break), and `:can_write`/`:can_delete` (constant true — the endpoint
  is superuser-only, so per-row perm checks add latency for no signal in v1)."
  [rows]
  (let [ids         (mapv :id rows)
        broken-ids  (mapv :id (filter #(pos? (:is_broken %)) rows))
        tables      (transform-target-tables ids)
        latest      (transform-latest-runs ids)
        reasons     (transform-reasons broken-ids)
        creators    (transform-creators ids)
        dep-counts  (transform-dependent-counts ids)]
    (mapv (fn [{:keys [id is_broken is_stale is_unreferenced source_json] :as row}]
            (let [flags (cond-> []
                          (pos? (or is_broken 0))       (conj "broken")
                          ;; For transforms the spike folds "no dependents" into the Stale
                          ;; bucket; introspector tracks the same signal as `is_unreferenced`.
                          (pos? (or is_unreferenced 0)) (conj "stale")
                          (pos? (or is_stale 0))        (conj "stale"))]
              (-> row
                  (dissoc :source_json)
                  (assoc :target_table    (get tables id))
                  (assoc :last_run        (get latest id))
                  (assoc :reasons         (get reasons id []))
                  (assoc :creator         (get creators id))
                  (assoc :dependent_count (get dep-counts id 0))
                  (assoc :transform_type  (parse-transform-type source_json))
                  (assoc :flags           (distinct flags))
                  (assoc :can_write       true)
                  (assoc :can_delete      true))))
          rows)))

(defn transforms-total
  "Total Transforms count for the same filter set."
  [opts]
  (-> (transforms-federated-query (assoc opts :limit nil :offset nil))
      (dissoc :limit :offset :order-by)
      (assoc :select [[:%count.* :total]])))

(defn fetch-transforms
  "Run the federated Transforms query and return `{:rows ... :total ...}`. Rows are
  decorated with `:target_table`, `:last_run`, and `:reasons` so the UI can render the
  spike's row shape (see `docs/developers-guide/transforms-admin-cleanup-spike.md`)."
  [opts]
  {:rows  (attach-transform-extras (t2/query (transforms-federated-query opts)))
   :total (-> (t2/query (transforms-total opts)) first :total)})

;;; -------------------------------------- summary --------------------------------------

(def ^:private archived-collection-ids-subq
  "Subquery selecting ids of all archived (trashed) collections."
  {:select [:id] :from [:collection] :where [:= :collection.archived true]})

(defn- count-cards
  "Count cards whose ids match `ids-cte`, applying the same archive/trash filters as the
   federated list query so summary counts line up with the list."
  [ids-cte]
  (-> {:select [[:%count.* :total]]
       :from   [:report_card]
       :where  [:and
                [:in :report_card.id {:select [:id] :from [[ids-cte :ids]]}]
                [:= :report_card.archived false]
                [:or
                 [:= :report_card.collection_id nil]
                 [:not-in :report_card.collection_id archived-collection-ids-subq]]]}
      t2/query first :total))

(defn- count-dashboards [ids-cte]
  (-> {:select [[:%count.* :total]]
       :from   [:report_dashboard]
       :where  [:and
                [:in :report_dashboard.id {:select [:id] :from [[ids-cte :ids]]}]
                [:= :report_dashboard.archived false]
                [:or
                 [:= :report_dashboard.collection_id nil]
                 [:not-in :report_dashboard.collection_id archived-collection-ids-subq]]]}
      t2/query first :total))

(defn- count-transforms [ids-cte]
  (-> {:select [[:%count.* :total]]
       :from   [:transform]
       :where  [:in :transform.id {:select [:id] :from [[ids-cte :ids]]}]}
      t2/query first :total))

(defn summary
  "Per-entity-type, per-condition counts for the stat strip."
  []
  (let [cutoff (t/minus (t/local-date) (t/months 6))]
    {:cards      {:broken       (count-cards (broken-ids-cte "card"))
                  :stale        (count-cards (card-stale-cte cutoff))
                  :unreferenced (count-cards (unreferenced-cards-cte))
                  :healthy      (-> {:select [[:%count.* :total]]
                                     :from   [:report_card]
                                     :where  [:and
                                              [:= :report_card.archived false]
                                              [:or
                                               [:= :report_card.collection_id nil]
                                               [:not-in :report_card.collection_id
                                                archived-collection-ids-subq]]]}
                                    t2/query first :total)}
     :dashboards {:broken       (count-dashboards (broken-ids-cte "dashboard"))
                  :stale        (count-dashboards (dashboard-stale-cte cutoff))
                  :unreferenced (count-dashboards (unreferenced-dashboards-cte))
                  :healthy      (-> {:select [[:%count.* :total]]
                                     :from   [:report_dashboard]
                                     :where  [:and
                                              [:= :report_dashboard.archived false]
                                              [:or
                                               [:= :report_dashboard.collection_id nil]
                                               [:not-in :report_dashboard.collection_id
                                                archived-collection-ids-subq]]]}
                                    t2/query first :total)}
     ;; Transforms have no `last_used_at`, so the existing introspector "stale =
     ;; time-based" concept doesn't apply. The spike (transforms-admin-cleanup-spike.md)
     ;; instead reuses "stale" to mean "orphaned output / no downstream dependents" —
     ;; i.e. exactly what introspector elsewhere calls `:unreferenced`. Report the same
     ;; value under both keys so the FE filter pill (Stale → ?conditions=unreferenced)
     ;; and the StatStrip tile agree. `broken` uses the combined CTE so the count
     ;; reflects analysis-finding errors *plus* target-table-missing *plus*
     ;; latest-run-failed, matching the list endpoint.
     :transforms (let [orphaned (count-transforms (unreferenced-transforms-cte))]
                   {:broken       (count-transforms (broken-transforms-cte))
                    :stale        orphaned
                    :unreferenced orphaned
                    :healthy      (-> {:select [[:%count.* :total]]
                                       :from   [:transform]}
                                      t2/query first :total)})}))
