(ns metabase.metabot.tools.conversations
  "Find and read the current user's past NLQ and internal conversations."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.metabot.conversation-recall :as recall]
   [metabase.metabot.conversation-recall-index :as recall-index]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.shared :as shared]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defn- result [f]
  (try
    (api/check-403 (some? api/*current-user-id*))
    {:output (json/encode (f))}
    (catch Exception e
      (log/warn e "Conversation recall failed")
      {:output (json/encode {:status "unavailable" :message (ex-message e)})})))

(defn- check-conversation! [id]
  (api/check-404 (not= id (shared/current-conversation-id)))
  (recall/owned-conversation! id))

(defn- page-token [turn offset]
  (str (:message-id turn) (when (pos? offset) (str ":" offset))))

(defn- snippet [conversation-id turn text]
  {:conversation_id conversation-id
   :url (recall/conversation-url conversation-id)
   :updated_at (str (:created-at turn))
   :page_token (page-token turn (:offset turn 0))
   :text text})

(defn- validated-hits [hits limit]
  (let [live-chunks (memoize (fn [id]
                               (try
                                 (check-conversation! id)
                                 (recall/chunks id)
                                 (catch Exception _ []))))]
    (->> hits
         (keep (fn [{:keys [conversation_id message_id content_hash]}]
                 (when-let [chunk (some #(when (and (= message_id (:message-id %))
                                                    (= content_hash (:content-hash %))) %)
                                        (live-chunks conversation_id))]
                   (snippet conversation_id chunk (:text chunk)))))
         distinct
         (reduce (fn [[counts results] hit]
                   (let [id (:conversation_id hit)]
                     (if (< (get counts id 0) 2)
                       [(update counts id (fnil inc 0)) (conj results hit)]
                       [counts results])))
                 [{} []])
         second
         (take limit)
         vec)))

(mu/defn ^{:tool-name "conversation_search" :scope scope/agent-resource-read}
  conversation-search-tool
  "Find relevant passages in your user's past NLQ/internal conversations. Use only when they refer to
  earlier work. Supply a short topic phrase, not a whole document or words like 'our conversation'.
  Matches use both keywords and meaning. within_conversation_id narrows to a known chat.
  Results include source URLs and page_token values for read_conversation. An empty result is not proof
  something was never discussed; try broader terms. Excerpts carry the artifact URIs and query
  definitions behind past results; your system prompt says how to continue working with them."
  [{:keys [query] limit :max_results conversation-id :within_conversation_id
    :or {limit 5}} :- [:map {:closed true}
                       [:query [:string {:min 1 :max 1000}]]
                       [:max_results {:optional true} [:int {:min 1 :max 10}]]
                       [:within_conversation_id {:optional true} [:maybe ms/UUIDString]]]]
  (result
   (fn []
     (when conversation-id (check-conversation! conversation-id))
     (let [{:keys [status results]} (recall-index/search api/*current-user-id*
                                                         (shared/current-conversation-id) query conversation-id)]
       {:status status
        :results (validated-hits results limit)}))))

(mu/defn ^{:tool-name "recent_chats" :scope scope/agent-resource-read}
  recent-chats-tool
  "Find your user's past NLQ/internal chats by time, newest first. Use before/after ISO datetimes for
  references like 'last week'. Paginate with before set to the oldest returned updated_at.
  Use conversation_search with within_conversation_id to find a topic inside a returned chat, or
  read_conversation for more context. Stop after about five pages and disclose incomplete coverage."
  [{:keys [n before after] :or {n 3}} :- [:map {:closed true}
                                          [:n {:optional true} [:int {:min 1 :max 20}]]
                                          [:before {:optional true} [:maybe :string]]
                                          [:after {:optional true} [:maybe :string]]]]
  (result
   (fn []
     {:status "ok"
      :results (mapv (fn [{:keys [id title updated_at]}]
                       (let [turn (last (recall/conversation-turns id))]
                         (assoc (snippet id turn (subs (:text turn "") 0 (min 1600 (count (:text turn "")))))
                                :title title :updated_at (str updated_at))))
                     (metabot.db/recall-conversations
                      api/*current-user-id* (shared/current-conversation-id)
                      {:n n :before (when before (t/offset-date-time before))
                       :after (when after (t/offset-date-time after))}))})))

(defn- page-text [turns start offset max-turns]
  (loop [idx start offset offset remaining max-turns text ""]
    (let [turn (get turns idx)
          separator (if (empty? text) "" "\n\n")
          room (- 24000 (count text) (count separator))]
      (cond
        (nil? turn) {:text text}
        (or (zero? remaining) (not (pos? room))) {:text text :next_page_token (page-token turn offset)}
        :else
        (let [rest-text (subs (:text turn) offset)
              end (min room (count rest-text))
              text (str text separator (subs rest-text 0 end))]
          (if (< end (count rest-text))
            {:text text :next_page_token (page-token turn (+ offset end))}
            (recur (inc idx) 0 (dec remaining) text)))))))

(defn- read-page [conversation-id token max-turns]
  (let [turns (vec (recall/conversation-turns conversation-id))
        [message-id offset] (when token (str/split token #":" 2))
        offset (if offset (parse-long offset) 0)
        start (if token
                (first (keep-indexed #(when (= message-id (str (:message-id %2))) %1) turns))
                0)
        _ (api/check-404 (and (some? start) (some? offset)
                              (<= 0 offset (count (:text (get turns start))))))]
    (cond-> (merge {:status "ok" :conversation_id conversation-id :url (recall/conversation-url conversation-id)}
                   (page-text turns start offset max-turns))
      (pos? offset) (assoc :prev_page_token (page-token (nth turns start) (max 0 (- offset 24000))))
      (and (zero? offset) (pos? start))
      (assoc :prev_page_token (page-token (nth turns (max 0 (- start max-turns))) 0)))))

(mu/defn ^{:tool-name "read_conversation" :scope scope/agent-resource-read}
  read-conversation-tool
  "Read a bounded passage from your user's past conversation. Use a conversation_id returned by
  conversation_search/recent_chats or supplied by the user. A search hit's page_token starts at its
  matching passage. Omit it to start at the beginning; returned next/prev tokens navigate adjacent
  passages. Read more only when needed. This does not load or modify any chart; your system prompt
  says how to continue working with a returned artifact."
  [{conversation-id :conversation_id page-token :page_token max-turns :max_turns
    :or {max-turns 20}} :- [:map {:closed true}
                            [:conversation_id ms/UUIDString]
                            [:page_token {:optional true} [:maybe :string]]
                            [:max_turns {:optional true} [:int {:min 1 :max 50}]]]]
  (result (fn []
            (check-conversation! conversation-id)
            (read-page conversation-id page-token max-turns))))
