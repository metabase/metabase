(ns metabase.dashboards.models.dashboard.search
  (:require
   [metabase.search.core :as search]))

(search/define-spec "dashboard"
  {:model        :model/Dashboard
   :attrs        {:archived       true
                  :collection-id  true
                  :creator-id     true
                  :database-id    false
                  :last-editor-id :r.user_id
                  :last-edited-at :r.timestamp
                  :last-viewed-at true
                  :pinned         [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]
                  :view-count     true
                  :created-at     true
                  :updated-at     true}
   :search-terms [:name :description]
   :render-terms {:archived-directly          true
                  :collection-authority_level :collection.authority_level
                  :collection-name            :collection.name
                  ;; This is used for legacy ranking, in future it will be replaced by :pinned
                  :collection-position        true
                  :collection-type            :collection.type
                  :moderated-status           :mr.status}
   :where        []
   :bookmark     [:model/DashboardBookmark [:and
                                            [:= :bookmark.dashboard_id :this.id]
                                            ;; a magical alias, or perhaps this clause can be implicit
                                            [:= :bookmark.user_id :current_user/id]]]
   :joins        {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                  :r          [:model/Revision [:and
                                                [:= :r.model_id :this.id]
                                                ;; Interesting for inversion, another condition on whether to update.
                                                ;; For now, let's just swallow the extra update (2x amplification)
                                                [:= :r.most_recent true]
                                                [:= :r.model "Dashboard"]]]
                  :mr         [:model/ModerationReview [:and
                                                        [:= :mr.moderated_item_type "dashboard"]
                                                        [:= :mr.moderated_item_id :this.id]
                                                        [:= :mr.most_recent true]]]}})
