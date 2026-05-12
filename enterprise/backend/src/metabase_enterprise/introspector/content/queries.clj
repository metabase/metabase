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
   [toucan2.core :as t2]))

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

(defn- unreferenced-transforms-cte []
  {:select-distinct [[:transform.id :id]]
   :from   [:transform]
   :left-join [:dependency [:and
                            [:= :dependency.to_entity_id :transform.id]
                            [:= :dependency.to_entity_type (h2x/literal "transform")]]]
   :where  [:= :dependency.id nil]})

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
  "Federated query for the Transforms tab. Surfaces `:broken` and `:unreferenced` only;
  `:stale` is dropped if requested (transforms have no `last_used_at`)."
  [{:keys [conditions search sort-column sort-direction limit offset]
    :or   {conditions     #{:broken :unreferenced}
           sort-column    :name
           sort-direction :asc
           limit          50
           offset         0}}]
  (let [conditions (disj conditions :stale)]
    (cond-> {:with [[:broken (broken-ids-cte "transform")]
                    [:unref  (unreferenced-transforms-cte)]]
             :select [:transform.id
                      :transform.name
                      :transform.description
                      :transform.source_database_id
                      :transform.creator_id
                      :transform.created_at
                      :transform.updated_at
                      [[:inline 0] :is_stale]
                      [[:case [:not= :broken.id nil] 1 :else 0] :is_broken]
                      [[:case [:not= :unref.id nil] 1 :else 0] :is_unreferenced]]
             :from   [:transform]
             :left-join [[:broken :broken] [:= :broken.id :transform.id]
                         [:unref :unref]   [:= :unref.id :transform.id]]
             :where  [:and
                      (cond
                        (and (contains? conditions :broken)
                             (contains? conditions :unreferenced))
                        [:or [:not= :broken.id nil] [:not= :unref.id nil]]

                        (contains? conditions :broken)       [:not= :broken.id nil]
                        (contains? conditions :unreferenced) [:not= :unref.id nil]
                        :else
                        [:or [:not= :broken.id nil] [:not= :unref.id nil]])]
             :order-by (case sort-column
                         :last_used_at [[:transform.updated_at (or sort-direction :desc)]]
                         [[:%lower.name (or sort-direction :asc)]])
             :limit    limit
             :offset   offset}

      (and search (not (str/blank? search)))
      (update :where conj
              [:like [:lower :transform.name]
               (str "%" (u/lower-case-en search) "%")]))))

(defn transforms-total
  "Total Transforms count for the same filter set."
  [opts]
  (-> (transforms-federated-query (assoc opts :limit nil :offset nil))
      (dissoc :limit :offset :order-by)
      (assoc :select [[:%count.* :total]])))

(defn fetch-transforms
  "Run the federated Transforms query and return `{:rows ... :total ...}`."
  [opts]
  {:rows  (t2/query (transforms-federated-query opts))
   :total (-> (t2/query (transforms-total opts)) first :total)})

;;; -------------------------------------- summary --------------------------------------

(defn- count-of [query]
  (-> {:select [[:%count.* :total]]
       :from   [[query :sub]]}
      t2/query first :total))

(defn summary
  "Per-entity-type, per-condition counts for the stat strip."
  []
  (let [cutoff (t/minus (t/local-date) (t/months 6))]
    {:cards      {:broken       (count-of (broken-ids-cte "card"))
                  :stale        (count-of (card-stale-cte cutoff))
                  :unreferenced (count-of (unreferenced-cards-cte))
                  :healthy      (-> {:select [[:%count.* :total]]
                                     :from   [:report_card]
                                     :where  [:= :archived false]}
                                    t2/query first :total)}
     :dashboards {:broken       (count-of (broken-ids-cte "dashboard"))
                  :stale        (count-of (dashboard-stale-cte cutoff))
                  :unreferenced (count-of (unreferenced-dashboards-cte))
                  :healthy      (-> {:select [[:%count.* :total]]
                                     :from   [:report_dashboard]
                                     :where  [:= :archived false]}
                                    t2/query first :total)}
     :transforms {:broken       (count-of (broken-ids-cte "transform"))
                  :stale        0
                  :unreferenced (count-of (unreferenced-transforms-cte))
                  :healthy      (-> {:select [[:%count.* :total]]
                                     :from   [:transform]}
                                    t2/query first :total)}}))
