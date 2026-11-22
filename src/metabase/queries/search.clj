(ns metabase.queries.search
  "The search specification of the cards, models and metrics, which share one base."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.revisions.sql :as revisions.sql]
   [metabase.search.core :as search]))

(set! *warn-on-reflection* true)

(defn- maybe-extract-native-query
  "Return the native SQL text (truncated to `max-searchable-value-length`) if `dataset_query` is native; else nil.
  Uses `query_type` to short-circuit without parsing JSON for non-native cards."
  [{:keys [dataset_query query_type]}]
  (when (= query_type "native")
    (let [query      ((:out lib-be/transform-query) dataset_query)
          query-text (:native (lib/query-stage query 0))]
      (when query-text
        (subs query-text 0 (min (count query-text) search/max-searchable-value-length))))))

(defn- base-search-spec
  "The search specification that the cards, models and metrics share, before it is narrowed to the type of one of them."
  []
  {:attrs        {:archived             true
                  :collection-id        true
                  :creator-id           true
                  :dashboard-id         true
                  :dashboardcard-count  ^:allow-subquery {:select [:%count.*]
                                                          :from   [:report_dashboardcard]
                                                          :where  [:= :report_dashboardcard.card_id :this.id]}
                  :database-id          true
                  :last-viewed-at       :last_used_at
                  :native-query         {:fn maybe-extract-native-query
                                         :fields [:dataset_query :query_type]}
                  :official-collection  [:= "official" :collection.authority_level]
                  :last-edited-at       :r.timestamp
                  :last-editor-id       :r.user_id
                  :pinned               [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]
                  :verified             [:= "verified" :mr.status]
                  :view-count           true
                  :created-at           true
                  :updated-at           true
                  :display-type         :this.display
                  :collection-type      :collection.type
                  :collection-location  :collection.location
                  :root-collection-type {:fn collection/root-collection-type}}
   :search-terms [:name :description]
   :render-terms {:archived-directly          true
                  :collection-authority_level :collection.authority_level
                  :collection-name            :collection.name
                  :collection-position        true
                  :display                    true
                  :moderated-status           :mr.status}
   :bookmark     [:model/CardBookmark [:and
                                       [:= :bookmark.card_id :this.id]
                                       [:= :bookmark.user_id :current_user/id]]]
   :where [:and [:or [:= :collection.namespace nil]
                 [:= :collection.namespace "shared-tenant-collection"]
                 [:= :collection.namespace "tenant-specific"]]
           [:= :this.document_id nil]]
   :joins        {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                  :r          [:model/Revision [:and
                                                [:= :r.model_id :this.id]
                                                [:= :r.model "Card"]
                                                (revisions.sql/newest-revision-clause :r "Card" :this.id)]]
                  :mr         [:model/ModerationReview [:and
                                                        [:= :mr.moderated_item_type "card"]
                                                        [:= :mr.moderated_item_id :this.id]
                                                        [:= :mr.most_recent true]]]}})

(defn card-search-spec
  "The search specification of the cards whose `:type` is `card-type`, one of \"question\", \"model\" and \"metric\"."
  [card-type]
  (-> (base-search-spec)
      (sql.helpers/where [:= :this.type card-type])))
