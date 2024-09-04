(ns metabase.search.fts.ingestion
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(def ^:private primary-keys
  [:name :description])

(def ^:private secondary-keys
  [:collection_name :table_description])

(defn- combine-fields [m ks]
  (str/join " " (keep m ks)))

(defn- display-data [m]
  (select-keys m [:id :model :name :description]))

(defn- attrs
  "Attributes for the tsvector"
  [_m]
  ;; ideas:
  ;; - collection name
  ;; - archived
  ;; -
  nil)

(defn- legacy->index [m]
  {:primary       (combine-fields m primary-keys)
   :secondary     (combine-fields m secondary-keys)
   :model         (:model m)
   :model_id      (:id m)
   ;; TODO - share this with existing rankers
   :model_rank    1
   :display_data  (json/generate-string (display-data m))
   :attrs         (attrs m)
   ;; fks
   :collection_id (:collection_id m)
   :database_id   (:database_id m)
   :table_id      (:table_id m)})

(defn reducible-cards
  "Gimme something to index"
  []
  (t2/reducible-query
   ;; Taken from existing search queries
   `{:select    ([~(h2x/literal "card") :model]
                 :card.id
                 :card.name
                 [[:cast nil :text] :display_name]
                 :card.description
                 :card.archived
                 :card.collection_id
                 [:collection.name :collection_name]
                 [:collection.type :collection_type]
                 [:collection.location :collection_location]
                 [:collection.authority_level :collection_authority_level]
                 :card.archived_directly
                 :card.collection_position
                 :card.creator_id
                 :card.created_at
                 [[:case [:not= :bookmark.id nil] true :else false] :bookmark]
                 :card.updated_at
                 ;; for ranking
                 [{:select [:%count.*],
                   :from   [:report_dashboardcard]
                   :where  [:= :report_dashboardcard.card_id :card.id]}
                  :dashboardcard_count]
                 [:r.timestamp :last_edited_at]
                 [:r.user_id :last_editor_id]
                 [:mr.status :moderated_status]
                 :card.display
                 :card.dataset_query),
     :from      [[:report_card :card]],
     :where     [:and
                 #_[:or [:like [:lower :card.name] "%meouw%"] [:like [:lower :card.description] "%meouw%"]]
                 #_[:= :card.archived false]
                 [:= :card.type "question"]
                 #_[:or
                    [:= :collection_id nil]
                    [:in
                     :collection_id
                     {:select :id,
                      :from   [[{:union-all [{:select [:c.*],
                                              :from   [[:collection :c]],
                                              :join   [[:permissions :p]
                                                       [:= :c.id :p.collection_id]
                                                       [:permissions_group :pg]
                                                       [:= :pg.id :p.group_id]
                                                       [:permissions_group_membership :pgm]
                                                       [:= :pgm.group_id :pg.id]],
                                              :where  [:and
                                                       [:= :pgm.user_id 1]
                                                       [:= :p.perm_type "perms/collection-access"]
                                                       [:or [:= :p.perm_value "read-and-write"] [:= :p.perm_value "read"]]]}
                                             {:select [:c.*], :from [[:collection :c]], :where [:in :id (3)]}]}
                                :c]],
                      :where  [:and nil nil nil nil nil]}]]
                 [:= :collection.namespace nil]],
     :left-join [[:card_bookmark :bookmark]
                 [:and [:= :bookmark.card_id :card.id] [:= :bookmark.user_id 1]]
                 [:collection :collection]
                 [:= :collection_id :collection.id]
                 [:revision :r]
                 [:and [:= :r.model_id :card.id] [:= :r.most_recent true] [:= :r.model "Card"]]
                 [:moderation_review :mr]
                 [:and
                  [:= :mr.moderated_item_type "card"]
                  [:= :mr.moderated_item_id :card.id]
                  [:= :mr.most_recent true]]],
     }))


(comment
  (t2/delete! :model/SearchIndex)
  (t2/select :model/SearchIndex)
  (t2/count :model/SearchIndex)

  (run! (fn [x-or-xs]
          (t2/insert! :model/SearchIndex x-or-xs)
          )
        (eduction
         (comp
          ;; not sure how to get this to play nicely with partition
          (map t2.realize/realize)
          (map legacy->index)
          #_(partition-all 2)
          #_(take 2))
         (reducible-cards)))

  (t2.realize/realize (reducible-cards)))
