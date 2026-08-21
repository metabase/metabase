(ns metabase.slackbot.blocks
  "Planning the one Slack message that carries a finalized metabot answer.

   The answer travels in a single `markdown` block. An answer too long to fit is cut, with
   [[truncation-notice]] appended to the same message, never split across messages.

   Everything here is pure; posting lives in `metabase.slackbot.channel`."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

;;; Every limit below was measured against Slack's API rather than taken from the docs, which are
;;; wrong on two counts: they describe 12000 as a per-payload total (it is enforced per block), and
;;; they do not list `msg_too_long` among `chat.postMessage`'s errors at all.

(def ^:private markdown-text-limit
  "Slack rejects a `markdown` block whose `text` exceeds 12000 characters with `msg_too_long`."
  12000)

(def ^:private message-text-limit
  "Total block text one message may carry once a `markdown` block is present; past it
   `chat.postMessage` fails with `msg_blocks_too_long`. Measured at 13202, held below that."
  13000)

(def ^:private max-message-blocks
  "Slack rejects a message with more than 50 blocks, counted *after* it expands a `markdown` block
   into its own rendering. Headings and thematic breaks each expand into a block of their own."
  50)

(def ^:private min-answer-chars
  "Message text held back from the visualizations for the answer.

   Without it the two compete for one budget and the visualizations, measured first, can take all
   of it -- leaving a message that is nothing but tables, followed by a notice claiming the answer
   was `cut short` when none of it was posted. Dropping a visualization is the better trade."
  2000)

(def ^:private min-answer-blocks
  "Blocks held back from the visualizations for the answer's own rendering.

   Slack expands a `markdown` block into several blocks, and that expansion counts against the same
   50-block ceiling the visualizations do. One block covers the markdown block itself; the rest
   leave room for the handful a few headings expand into."
  8)

(def viz-only-preview-text
  "Slack needs a non-empty `text` on a message whose content is all visualization blocks.

   This is the notification preview, never the answer -- `slackbot.streaming/ignore-msg?` filters
   it back out of replayed history so the model is never told it once said this."
  "Query results")

(defn- truncation-notice
  "The copy explaining that an answer was cut short. `url` points at the untruncated answer in
   Metabase; nil yields the same sentence without a link.

   Addressed to whoever asked, because the conversation is not readable by everyone who can see
   this message."
  [url]
  (str "_This answer was too long to post in Slack, so I cut it short._\n\n"
       "Whoever asked can "
       ;; Both `<url|label>` and `[label](url)` render inside a `markdown` block -- Slack parses
       ;; each into a `link` element (measured). The Slack form matches every other link the
       ;; slackbot emits, and the syntax the system prompt hands the model.
       (if url
         (str "<" url "|see it in full in Metabase>")
         "see it in full in Metabase")
       ". Or ask a narrower question so the answer comes back smaller."))

(defn- markdown-block
  [text]
  {:type "markdown" :text text})

(def ^:private counted-text-keys
  "Block keys whose string values Slack counts against the per-message budget. `:alt_text` carries
   an `image` block's caption and is charged for just like `:text`."
  #{:text :alt_text})

(defn- block-text-length
  "Length of every counted text string nested anywhere in `x`, which is what Slack charges against
   its per-message budget."
  [x]
  (cond
    (map? x)        (reduce-kv (fn [total k v]
                                 (+ total (if (and (counted-text-keys k) (string? v))
                                            (count v)
                                            (block-text-length v))))
                               0
                               x)
    (sequential? x) (reduce + 0 (map block-text-length x))
    :else           0))

(defn- context-block
  "A muted aside. Its text counts against the message budget but, unlike the message's `:text`
   field, it is not what `slackbot.streaming/thread->history` replays as the assistant's words."
  [text]
  {:type "context" :elements [{:type "mrkdwn" :text text}]})

(def ^:private omitted-viz-block
  (context-block "_Some visualizations were omitted._"))

(defn- capped-viz-blocks
  "`viz-blocks` trimmed from the end until they fit both `max-blocks` and `text-budget`, with
   [[omitted-viz-block]] appended when anything was dropped.

   The input is flat, with no group boundaries, so a cut can orphan a visualization title -- still
   better than Slack rejecting the whole message."
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

(defn- structural-line?
  "True for a line Slack renders as a block of its own: an ATX heading, or a thematic break."
  [line]
  (let [line (str/trim line)]
    (boolean (or (re-matches #"#{1,6}\s+\S.*" line)
                 (re-matches #"-{3,}|\*{3,}|_{3,}" line)))))

(defn- structural-cut
  "Where `answer` has to be cut for its Slack rendering to fit in `max-blocks`, or nil if it fits.

   Slack expands a `markdown` block into its own blocks: a heading or a thematic break becomes a
   block, and also ends the prose block running before it. Two blocks per structural line, plus one
   for leading prose, is therefore an upper bound on the expansion -- and an upper bound is what is
   wanted here, because guessing low means Slack rejects the whole message with `invalid_blocks`."
  [answer max-blocks]
  (let [allowed (quot (max 0 (dec max-blocks)) 2)]
    (loop [lines (str/split-lines answer), idx 0, seen 0]
      (when-let [line (first lines)]
        (let [seen (cond-> seen (structural-line? line) inc)]
          (if (> seen allowed)
            idx
            ;; +1 for the newline `split-lines` consumed.
            (recur (next lines) (+ idx (count line) 1) seen)))))))

(defn message-payloads
  "Plan the message carrying a finalized answer.

   Returns `{:message {:text .. :blocks ..} :truncated? bool}`. When the answer does not fit it is
   cut and [[truncation-notice]] rides along in a `context` block of the *same* message, which is
   what keeps the whole reply addressable by a single `slack_msg_id`.

   The answer and its visualizations share one budget, so a large table shortens the prose rather
   than getting the whole message rejected; [[min-answer-chars]] and [[min-answer-blocks]] are held
   back so the prose is shortened rather than erased. Feedback buttons ride this message -- it is
   the one a rating or a delete has to resolve to.

   `conversation-url` is passed to [[truncation-notice]]."
  [text viz-blocks feedback-blocks conversation-url]
  (let [answer       (str/trim text)
        feedback-len (block-text-length feedback-blocks)
        ;; Never hold back more than the answer can actually use.
        reserved     (min min-answer-chars (count answer))
        ;; Visualizations are measured first: they are indivisible, while prose can be cut.
        viz          (capped-viz-blocks viz-blocks
                                        (- max-message-blocks min-answer-blocks (count feedback-blocks))
                                        (max 0 (- message-text-limit feedback-len reserved)))
        text-budget  (max 0 (min markdown-text-limit
                                 (- message-text-limit feedback-len (block-text-length viz))))
        ;; One block is kept in hand for the notice, in case this cut is what calls for it.
        block-cut    (structural-cut answer (- max-message-blocks 1 (count viz) (count feedback-blocks)))
        budget       (cond-> text-budget block-cut (min block-cut))
        truncated?   (> (count answer) budget)
        notice       (when truncated? (truncation-notice conversation-url))
        ;; A blunt cut: no boundary seeking, no fence repair. The notice explains it, and any
        ;; cleverness here would still be guessing at where the model meant to break.
        answer       (cond-> answer truncated? (subs 0 (max 0 (- budget (count notice)))))
        blocks       (-> []
                         (cond-> (seq answer) (conj (markdown-block answer)))
                         (into viz)
                         (cond-> notice (conj (context-block notice)))
                         (into feedback-blocks))]
    {:truncated? truncated?
     ;; `:text` is Slack's notification preview, and also the field `thread->history` replays as
     ;; the assistant's own words -- so the notice is deliberately kept out of it.
     :message    {:text   (if (str/blank? answer) viz-only-preview-text answer)
                  :blocks blocks}}))
