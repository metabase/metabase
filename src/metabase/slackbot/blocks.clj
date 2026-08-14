(ns metabase.slackbot.blocks
  "Turning a finalized metabot answer into a Slack Block Kit payload.

   Slack rejects the whole message when a `section` block exceeds its character limit, so a long
   answer has to be split across several blocks, and a very long one truncated. Everything here is
   pure -- posting lives in `metabase.slackbot.channel`."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def section-text-limit
  "Slack rejects a `section` block whose `text.text` exceeds 3000 characters with `invalid_blocks`."
  3000)

(def ^:private max-text-blocks
  "Maximum number of `section` blocks to spend on the answer text. Slack caps a message at
   50 blocks total; the rest of the budget is left for visualizations and the feedback
   buttons."
  20)

(def ^:private max-message-blocks
  "Slack rejects a message with more than 50 blocks."
  50)

(defn- text-chunks
  "Split `text` into chunks of at most [[section-text-limit]] characters, preferring
   paragraph then line boundaries so a chunk does not end mid-word. A single run longer than
   the limit is hard cut.

   Lazy: only [[max-text-blocks]] chunks are ever rendered, so a very long answer is not split
   past the point where the extra chunks would be discarded."
  [text]
  (lazy-seq
   (if (<= (count text) section-text-limit)
     [text]
     (let [window    (subs text 0 section-text-limit)
           ;; Prefer the last paragraph break, then the last line break, then a hard cut.
           break-idx (or (str/last-index-of window "\n\n")
                         (str/last-index-of window "\n")
                         section-text-limit)
           ;; A break at index 0 would make no progress; hard cut instead.
           break-idx (if (zero? break-idx) section-text-limit break-idx)]
       (cons (subs text 0 break-idx)
             (text-chunks (subs text break-idx)))))))

(def ^:private truncation-notice
  "Marks the dropped tail so it is visible to the reader rather than silently lost."
  "_Response truncated._")

;; TODO (BOT-1606 follow-up): markdown that spans a split is not repaired.
;;   - A ``` fence crossing a block boundary leaves one block with an unterminated fence and the
;;     next starting with a stray ```, so both halves render as broken markdown.
;;   - Language labels are passed through: Slack has no syntax highlighting, so ```sql renders
;;     with a literal "sql" line at the top of the code block.
(defn final-text-blocks
  "Build the leading text block(s) for a finalized non-streaming Slack message.
   Long answers are split across several `section` blocks so Slack accepts the message."
  [text]
  ;; Taking one more than we render is what makes `truncated?` exact; the cap has to sit after
  ;; `remove str/blank?`, or dropped blank chunks would skew it. `into` stops at the `take`.
  (let [chunks     (into [] (comp (map str/trim) (remove str/blank?) (take (inc max-text-blocks)))
                         (text-chunks text))
        truncated? (> (count chunks) max-text-blocks)
        ;; The notice gets a block of its own rather than being appended to the last chunk, which
        ;; could push that chunk over the limit.
        kept       (cond-> (vec (take max-text-blocks chunks))
                     truncated? (conj truncation-notice))]
    (mapv (fn [chunk]
            {:type "section"
             :text {:type "mrkdwn"
                    :text chunk}})
          kept)))

(def ^:private omitted-viz-block
  {:type "context" :elements [{:type "mrkdwn" :text "_Some visualizations were omitted._"}]})

(defn cap-blocks
  "Assemble the message blocks within Slack's [[max-message-blocks]] ceiling. Text and feedback
   blocks are always kept; visualizations are dropped from the end. `collect-viz-blocks` returns a
   flat vector with no group boundaries, so a cut can orphan a visualization title -- still better
   than Slack rejecting the whole message.

   `room` is always comfortable: the text blocks are capped at [[max-text-blocks]] plus a possible
   truncation notice, and `feedback-blocks` is a single block, so it cannot go below 28."
  [text-blocks viz-blocks feedback-blocks]
  (let [room (- max-message-blocks (count text-blocks) (count feedback-blocks))
        viz  (if (<= (count viz-blocks) room)
               (vec viz-blocks)
               ;; One slot goes to the notice, so the drop is visible to the reader.
               (conj (vec (take (dec room) viz-blocks)) omitted-viz-block))]
    (into (into (vec text-blocks) viz) feedback-blocks)))
