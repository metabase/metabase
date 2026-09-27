(ns metabase.jev.db
  "Application database queries for the jev module."
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [toucan2.core :as t2]))

(defn message-rows
  "The stored message rows of conversation `conversation-id`, oldest first."
  [conversation-id]
  (t2/query {:select   [:id :role :data :error :finished :deleted_at :created_at]
             :from     [:metabot_message]
             :where    [:= :conversation_id conversation-id]
             :order-by [[:id :asc]]}))

(defn conversation-exists?
  "True when a Metabot conversation with `conversation-id` exists."
  [conversation-id]
  (t2/exists? :metabot_conversation :id conversation-id))

(defn review
  "The review row of conversation `conversation-id`, or nil."
  [conversation-id]
  (t2/select-one :model/MetabotConversationReview :conversation_id conversation-id))

(defn upsert-review!
  "Insert or replace the review row of conversation `conversation-id` with `fields`."
  [conversation-id fields]
  (mdb/update-or-insert! :model/MetabotConversationReview
                         {:conversation_id conversation-id}
                         (fn [existing]
                           (cond-> fields
                             existing (assoc :updated_at (t/offset-date-time))))))

(defn- pending-query
  "Conversations with messages and no review of `version` covering their latest message."
  [select version]
  {:select    select
   :from      [[:metabot_conversation :c]]
   :left-join [[:metabot_conversation_review :r] [:= :r.conversation_id :c.id]]
   :where     [:and
               [:exists ^:allow-subquery {:select [1]
                                          :from   [[:metabot_message :m]]
                                          :where  [:= :m.conversation_id :c.id]}]
               [:or
                [:= :r.conversation_id nil]
                [:not= :r.version version]
                [:< :r.last_message_id ^:allow-subquery {:select [[[:max :m2.id]]]
                                                         :from   [[:metabot_message :m2]]
                                                         :where  [:= :m2.conversation_id :c.id]}]]]})

(defn pending-conversation-ids
  "Up to `limit` ids of conversations needing a review of `version`, ordered by id, after `after-id` (nil for the
  start)."
  [version after-id limit]
  (let [q (pending-query [:c.id] version)]
    (mapv :id (t2/query (cond-> (assoc q :order-by [[:c.id :asc]] :limit limit)
                          after-id (update :where conj [:> :c.id after-id]))))))

(defn pending-count
  "How many conversations need a review of `version`."
  [version]
  (:count (t2/query-one (pending-query [[[:count :*] :count]] version))))

(defn review-count
  "How many review rows have `version`."
  [version]
  (t2/count :model/MetabotConversationReview :version version))

(defn reviews-with-version
  "The review rows with `version`."
  [version]
  (t2/select :model/MetabotConversationReview :version version))

(defn update-review!
  "Merge `fields` into the review row of conversation `conversation-id`."
  [conversation-id fields]
  (t2/update! :model/MetabotConversationReview conversation-id (assoc fields :updated_at (t/offset-date-time))))

(defn mark-all-reviews!
  "Set every review row's version to `version`."
  [version]
  (t2/update! :model/MetabotConversationReview {:version [:not= version]} {:version version}))
