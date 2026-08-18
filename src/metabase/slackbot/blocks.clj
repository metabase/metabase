(ns metabase.slackbot.blocks
  "Planning the Slack messages that carry a finalized metabot answer.

   The answer travels in a single `markdown` block: Slack parses standard markdown itself, so the
   model's prose needs no mrkdwn translation step. An answer too long to fit is cut and followed by
   [[truncation-notice]], rather than split -- splitting spanned several Slack messages, which broke
   message-level operations like delete, and no boundary-seeking survives contact with a model that
   cannot count characters.

   Everything here is pure; posting lives in `metabase.slackbot.channel`."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

;;; Every limit below was measured against Slack's API rather than taken from the docs, which are
;;; wrong on two counts: they describe 12000 as a per-payload total (it is enforced per block), and
;;; they do not list `msg_too_long` among `chat.postMessage`'s errors at all.

(def markdown-text-limit
  "Slack rejects a `markdown` block whose `text` exceeds 12000 characters with `msg_too_long`."
  12000)

(def ^:private message-text-limit
  "Total block text one message may carry once a `markdown` block is present; past it
   `chat.postMessage` fails with `msg_blocks_too_long`. Measured at 13202, held below that.

   This is why the answer competes with its visualizations for room: a table block runs to 9500
   characters (`slackbot.query/*slack-table-max-chars*`), so a full-length answer beside one would
   be rejected outright."
  13000)

(def ^:private max-message-blocks
  "Slack rejects a message with more than 50 blocks, counted *after* it expands a `markdown` block
   into its own rendering. Paragraphs do not expand -- 120 of them in one block came back as a
   single `rich_text` block -- but headings and `---` each become a block of their own, so 49
   heading/body pairs breach the ceiling at barely 1000 characters. The system prompt bans both."
  50)

(defn truncation-notice
  "Posted after an answer that had to be cut short, so the reader knows why and what to do next.
   `url` points at the untruncated answer in Metabase. Nil leaves the sentence standing without a
   link, which is what an instance with no site URL configured gets."
  [url]
  (str "_This answer was too long to post in Slack, so I cut it short._\n\n"
       "To see it in full, "
       ;; Both `<url|label>` and `[label](url)` render inside a `markdown` block -- Slack parses
       ;; each into a `link` element (measured). The Slack form matches every other link the
       ;; slackbot emits, and the syntax the system prompt hands the model.
       (if url
         (str "<" url "|open this conversation in Metabase>")
         "open this conversation in Metabase")
       ". Or ask a narrower question so the answer comes back smaller."))

(defn- markdown-block
  [text]
  {:type "markdown" :text text})

(defn block-text-length
  "Length of every `:text` string nested anywhere in `x`, which is what Slack counts against its
   per-message budget."
  [x]
  (cond
    (map? x)        (reduce-kv (fn [total k v]
                                 (+ total (if (and (= k :text) (string? v))
                                            (count v)
                                            (block-text-length v))))
                               0
                               x)
    (sequential? x) (reduce + 0 (map block-text-length x))
    :else           0))

(def ^:private omitted-viz-block
  {:type "context" :elements [{:type "mrkdwn" :text "_Some visualizations were omitted._"}]})

(defn- cap-viz-blocks
  "Trim `viz-blocks` from the end until they fit both Slack's block ceiling and `text-budget`,
   appending a notice when anything was dropped.

   `collect-viz-blocks` returns a flat vector with no group boundaries, so a cut can orphan a
   visualization title -- still better than Slack rejecting the whole message."
  [viz-blocks max-blocks text-budget]
  (loop [kept [] remaining (seq viz-blocks) budget text-budget]
    (let [block (first remaining)
          size  (some-> block block-text-length)]
      (if (and block
               (< (count kept) max-blocks)
               (<= size budget))
        (recur (conj kept block) (next remaining) (- budget size))
        (cond-> kept
          ;; One slot goes to the notice, so the drop is visible to the reader.
          (seq remaining) (-> (cond-> (>= (count kept) max-blocks) pop)
                              (conj omitted-viz-block)))))))

(defn message-payloads
  "Plan the messages carrying a finalized answer.

   Returns `{:messages [{:text .. :blocks ..} ...] :truncated? bool}`, to be posted in order. The
   answer is one message; when it does not fit, a second carries [[truncation-notice]].

   The answer and its visualizations share one budget, so a large table shortens the prose rather
   than getting the whole message rejected. Feedback buttons ride the answer message -- it is the
   substantive one, and the one a rating or a delete should resolve to.

   `conversation-url` is passed to [[truncation-notice]]; see there for nil."
  [text viz-blocks feedback-blocks conversation-url]
  (let [feedback-len (block-text-length feedback-blocks)
        ;; Visualizations are measured first: they are indivisible, while prose can be cut.
        viz          (cap-viz-blocks viz-blocks
                                     (- max-message-blocks 1 (count feedback-blocks))
                                     (- message-text-limit feedback-len))
        budget       (max 0 (min markdown-text-limit
                                 (- message-text-limit feedback-len (block-text-length viz))))
        answer       (str/trim text)
        truncated?   (> (count answer) budget)
        ;; A blunt cut: no boundary seeking, no fence repair. The notice explains it, and any
        ;; cleverness here would still be guessing at where the model meant to break.
        answer       (cond-> answer truncated? (subs 0 budget))
        answer-blocks (cond-> []
                        (seq answer) (conj (markdown-block answer)))]
    {:truncated? truncated?
     :messages   (cond-> [{:text   (if (str/blank? answer) "Query results" answer)
                           :blocks (into (into answer-blocks viz) feedback-blocks)}]
                   truncated? (conj (let [notice (truncation-notice conversation-url)]
                                      {:text notice :blocks [(markdown-block notice)]})))}))
