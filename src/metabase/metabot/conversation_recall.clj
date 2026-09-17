(ns metabase.metabot.conversation-recall
  "Text transcripts and artifact references for recalling the user's own conversations."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as schema]
   [metabase.util.json :as json]))

(def profiles
  "Profiles whose conversations participate in recall."
  #{"internal" "nlq" "nlq-fallback"})

(defn eligible-message?
  "Whether a message is a live, recallable user message or successful completed assistant message."
  [{:keys [role finished error deleted_at profile_id]}]
  (and (profiles profile_id)
       (nil? deleted_at)
       (or (= role :user) (and (= role :assistant) (true? finished) (nil? error)))))

(defn conversation-url
  "Browser path to a source conversation."
  [conversation-id]
  (str "/metabot/conversation/" conversation-id))

(defn owned-conversation!
  "Read a conversation owned by the current user; never grants an administrator override."
  [conversation-id]
  (api/check-404
   (when api/*current-user-id*
     (let [conversation (metabot.db/conversation conversation-id)]
       (when (= api/*current-user-id* (:user_id conversation)) conversation)))))

(defn- generated-entities [row]
  (keep #(when (= "data-generated_entity" (:type %)) (:data %)) (:data row)))

(defn- generated-state [row]
  (reduce
   (fn [state {:keys [id query display title description type]}]
     (if (and (= type "card") id (map? (:query query)))
       (-> state
           (assoc-in [:queries (:id query)] (:query query))
           (assoc-in [:charts id] {:query_id (:id query)
                                   :queries [(:query query)]
                                   :visualization_settings {:chart_type display}
                                   :chart_config {:title title :description description}}))
       state))
   {} (generated-entities row)))

(defn- row-state [row]
  (reduce memory/merge-states
          (generated-state row)
          (concat (keep #(when (= "data-state" (:type %)) (schema/normalize-state (:data %))) (:data row))
                  [(:state row)])))

(defn state-at
  "Reconstruct eligible artifact state through a particular message, including legacy generated entities."
  [messages message-id]
  (let [rows (vec (filter eligible-message? messages))
        idx  (first (keep-indexed #(when (= message-id (:id %2)) %1) rows))]
    (api/check-404 (some? idx))
    (reduce memory/merge-states {} (map row-state (take (inc idx) rows)))))

(defn- artifact-uri [conversation-id message-id kind id]
  (str "metabase://conversation/" conversation-id "/message/" message-id "/" kind "/" id))

(defn- bounded-text [s n]
  (when (string? s)
    (if (> (count s) n) (str (subs s 0 n) " [truncated]") s)))

(defn- artifact-text [conversation-id row saved-cards]
  (let [state       (row-state row)
        saved       (group-by :metabot_chart_id saved-cards)
        tool-title  (some #(get-in % [:input :title]) (reverse (:data row)))
        chart-lines (for [[id chart] (:charts state)]
                      (str "Artifact: " (or (get-in chart [:chart_config :title]) tool-title "Unsaved chart")
                           "\n" (get-in chart [:chart_config :description])
                           "\nVisualization: " (get-in chart [:visualization_settings :chart_type])
                           "\nResource: " (artifact-uri conversation-id (:id row) "chart" id)
                           (apply str (for [card (saved id)]
                                        (str "\nSaved question: metabase://question/" (:id card)
                                             " /question/" (:id card))))
                           "\nQuery: " (bounded-text
                                        (json/encode (or (first (:queries chart))
                                                         (get-in state [:queries (:query_id chart)]))) 4000)))
        query-lines (for [[id query] (:queries state)]
                      (str "Query resource: " (artifact-uri conversation-id (:id row) "query" id)
                           "\n" (bounded-text (json/encode query) 4000)))
        saved-links (for [part (:data row)
                          :when (= "data-entity_saved" (:type part))
                          :let [{:keys [card_id title]} (:data part)]
                          :when card_id]
                      (str "Saved question: " title " metabase://question/" card_id " /question/" card_id))
        links       (for [{:keys [type title url]} (generated-entities row)
                          :when (and (not= type "card") url)]
                      (str "Artifact: " title " " url))]
    (str/join "\n" (concat chart-lines query-lines saved-links links))))

(defn- row-text [conversation-id row saved-cards]
  (str (if (= :user (:role row)) "User" "Assistant")
       " [" (:created_at row) ", message " (:id row) "]:\n"
       (str/join "\n" (keep #(when (= "text" (:type %)) (:text %)) (:data row)))
       (when (= :assistant (:role row))
         (str "\n" (artifact-text conversation-id row saved-cards)))))

(defn turns
  "Completed exchanges rendered without titles or arbitrary tool output. Input messages are in reader order."
  [conversation-id messages saved-cards]
  (let [groups (partition-by #(= :user (:role %)) messages)]
    (into []
          (keep (fn [[users assistants]]
                  (let [users      (filter #(and (= :user (:role %)) (eligible-message? %)) users)
                        assistants (filter #(and (= :assistant (:role %)) (eligible-message? %)) assistants)]
                    (when (and (seq users) (seq assistants))
                      {:message-id (:id (last assistants))
                       :user-message-id (:id (first users))
                       :created-at (:created_at (last assistants))
                       :text (str/join "\n\n" (map #(row-text conversation-id % saved-cards)
                                                   (concat users assistants)))}))))
          (partition 2 1 groups))))

(defn conversation-turns
  "Render the completed eligible turns in a conversation. Callers must enforce ownership on request paths."
  [conversation-id]
  (turns conversation-id (metabot.db/live-messages conversation-id)
         (metabot.db/saved-cards-for-conversation conversation-id)))

(defn text-hash
  "Stable content fingerprint used to avoid re-embedding unchanged excerpts."
  [text]
  (codecs/bytes->hex (buddy-hash/sha256 text)))

(defn- text-chunks [text]
  ;; About 800 tokens with 100-token overlap. Prefer paragraph boundaries over cutting a sentence.
  (loop [start 0 chunks []]
    (let [end (min (count text) (+ start 3200))
          paragraph (when (< end (count text)) (str/last-index-of text "\n\n" end))
          end (if (and paragraph (> paragraph (+ start 1600))) paragraph end)
          chunks (conj chunks {:text (subs text start end) :offset start})]
      (if (= end (count text)) chunks (recur (long (- end 400)) chunks)))))

(defn chunks
  "Search documents for a conversation; every chunk points back to its exchange."
  [conversation-id]
  (mapcat (fn [{:keys [text] :as turn}]
            (map-indexed (fn [i {:keys [text offset]}]
                           (assoc turn :text text :offset offset :chunk-index i :content-hash (text-hash text)))
                         (text-chunks text)))
          (conversation-turns conversation-id)))
