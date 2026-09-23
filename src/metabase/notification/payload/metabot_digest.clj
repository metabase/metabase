(ns metabase.notification.payload.metabot-digest
  "Hackathon 2026: when a dashboard subscription carries a `metabot_prompt`, run Metabot over the dashboard's results
  and put its write-up at the top of the report. On any failure the report goes out unchanged."
  (:require
   [clojure.string :as str]
   [metabase.channel.shared :as channel.shared]
   [metabase.metabot.agent.core :as metabot.agent]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.context :as metabot.context]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.request.core :as request]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-rows-per-card 50)

;; Slack renders one markdown section per text part and caps it around 3000 chars; stay under it.
(def ^:private max-text-part-chars 2800)

(defn- cell->str [v]
  (cond
    (nil? v)    ""
    (number? v) (str v)
    :else       (str/trim (str v))))

(defn- card-part->text
  "One card's name and result as compact text for the model, labelled with its card id so the model can pick it."
  [{:keys [card] :as part}]
  (let [{:keys [data row_count]} (:result (channel.shared/maybe-realize-data-rows part))
        cols  (map (some-fn :display_name :name) (:cols data))
        rows  (take max-rows-per-card (:rows data))
        total (or row_count (count (:rows data)))]
    (str "### [card " (:id card) "] " (:name card)
         (when-let [d (not-empty (:description card))] (str "\n" d))
         "\nColumns: " (str/join " | " cols)
         "\nRows (" (count rows) " of " total "):\n"
         (str/join "\n" (map #(str/join " | " (map cell->str %)) rows)))))

(defn- parts->dashboard-text
  [parts]
  (->> parts
       (keep (fn [{:keys [type] :as part}]
               (case type
                 :card      (when (get-in part [:result :data]) (card-part->text part))
                 :heading   (str "## " (:text part))
                 :text      (:text part)
                 :tab-title (str "# " (:text part))
                 nil)))
       (str/join "\n\n")))

(defn- user-message
  [{:keys [dashboard prompt schedule-unit]} dashboard-text]
  (str "Report instruction from the subscriber:\n" prompt
       "\n\nDashboard: " (:name dashboard)
       (when schedule-unit (str "\nThis report is sent every " (name schedule-unit)
                                ", so compare periods by " (name schedule-unit) " unless told otherwise."))
       "\n\nCurrent results of every card on the dashboard:\n\n" dashboard-text))

(defn- run-metabot!
  "Run the :subscription profile once and return its text, or throw."
  [message]
  (let [metabot-id (metabot.config/resolve-dynamic-metabot-id nil)
        context    (metabot.context/create-context {} {:metabot-id metabot-id :profile-id :subscription})
        parts      (into [] (metabot.agent/run-agent-loop
                             {:messages      [{:role :user :content message}]
                              :metabot-id    metabot-id
                              :profile-id    :subscription
                              :state         {}
                              :context       context
                              :tracking-opts {:source "dashboard_subscription"}}))
        errors     (filter #(= :error (:type %)) parts)
        ;; the model narrates between tool calls ("Let me check..."); the report is only what it wrote after the
        ;; last tool result
        final      (let [i (last (keep-indexed (fn [i p] (when (= :tool-output (:type p)) i)) parts))]
                     (if i (drop (inc i) parts) parts))
        text       (->> final (filter #(= :text (:type %))) (map :text) (str/join) str/trim)]
    (when (seq errors)
      (throw (ex-info "Metabot returned an error" {:errors (map :error errors)})))
    (when (str/blank? text)
      (throw (ex-info "Metabot returned no text" {:part-types (map :type parts)})))
    text))

(defn- split-for-slack
  "Split markdown into text parts that each fit one Slack section, breaking on paragraphs."
  [markdown]
  (->> (str/split markdown #"\n\n")
       (reduce (fn [chunks para]
                 (let [cur (peek chunks)]
                   (if (and cur (< (+ (count cur) 2 (count para)) max-text-part-chars))
                     (conj (pop chunks) (str cur "\n\n" para))
                     (conj chunks para))))
               [])
       (map (fn [chunk] {:type :text :text chunk}))))

(defn- parse-charts-line
  "Split Metabot's text into [markdown selected-dashcard-ids]. `selected` is nil when the model gave no CHARTS line
  (keep everything), or a vector of ids in the model's order (empty for `none`)."
  [text]
  (if-let [[_ before ids] (re-find #"(?sm)^(.*?)\n?^CHARTS:\s*(.*?)\s*$" (str/replace text "\r" ""))]
    [(str/trim before)
     (if (re-find #"(?i)none" ids)
       []
       (vec (distinct (map parse-long (re-seq #"\d+" ids)))))]
    [text nil]))

(defn- select-card-parts
  "Keep the card parts Metabot picked, in its order; release the temp files of the ones it dropped. Non-card parts
  (headings, text cards) are dropped: the write-up replaces them."
  [parts selected]
  (let [cards    (filter #(= :card (:type %)) parts)
        by-id    (group-by #(get-in % [:card :id]) cards)
        keep     (if (nil? selected)
                   cards
                   (mapcat by-id selected))
        keep-ids (into #{} (map #(get-in % [:card :id])) keep)]
    (doseq [part cards
            :when (not (keep-ids (get-in part [:card :id])))]
      (some-> part :result :data :rows notification.payload/cleanup!))
    (vec keep)))

(defn digest-parts
  "Prepend Metabot's write-up (as `:text` parts) to the cards it picked, when the subscription has a prompt. Runs as
  the subscription creator, like the card queries. Returns `parts` untouched when there is no prompt or Metabot fails."
  [creator-id dashboard {:keys [metabot_prompt schedule_unit] :as _dashboard-subscription} parts]
  (if (str/blank? metabot_prompt)
    parts
    (try
      (let [message             (user-message {:dashboard dashboard :prompt metabot_prompt :schedule-unit schedule_unit}
                                              (parts->dashboard-text parts))
            text                (request/with-current-user creator-id
                                  (run-metabot! message))
            [markdown selected] (parse-charts-line text)
            cards               (select-card-parts parts selected)]
        (log/infof "Metabot digest for dashboard %s: %d chars, charts %s" (:id dashboard) (count markdown)
                   (if selected selected "all"))
        (into (vec (split-for-slack markdown)) cards))
      (catch Exception e
        (log/warnf e "Metabot digest failed for dashboard %s; sending the report unchanged" (:id dashboard))
        parts))))
