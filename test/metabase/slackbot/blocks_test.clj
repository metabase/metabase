(ns metabase.slackbot.blocks-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.slackbot.blocks :as slackbot.blocks]
   [metabase.slackbot.test-util :as tu]))

(set! *warn-on-reflection* true)

(def ^:private markdown-text-limit @#'slackbot.blocks/markdown-text-limit)
(def ^:private truncation-notice #'slackbot.blocks/truncation-notice)

(defn- repeated
  [n s]
  (apply str (repeat n s)))

(def ^:private feedback
  [{:type "context_actions" :block_id "metabot_feedback" :elements []}])

(def ^:private conversation-url
  "Where the truncation notice points: the untruncated answer in the Metabase web UI."
  "https://metabase.example.com/metabot/conversation/conversation-id")

(def ^:private table-viz
  [{:type "section" :text {:type "mrkdwn" :text "*Orders*"}}
   {:type "table" :rows [[{:type "raw_text" :text "1"}]]}])

(defn- big-table
  "A table block at the 9500 character ceiling `slackbot.query` trims results to."
  []
  {:type "table" :rows [[{:type "raw_text" :text (repeated 9500 "c")}]]})

(defn- notice-length
  "How much of the budget the truncation notice takes when it has to ride along."
  []
  (count (truncation-notice conversation-url)))

(deftest ^:parallel fits-in-one-message-test
  (testing "an answer within budget is posted whole, in one message, untouched"
    (let [{:keys [message truncated?]} (slackbot.blocks/message-payloads "All done." table-viz feedback conversation-url)]
      (is (false? truncated?))
      (is (= "All done." (:text message)))
      (is (= ["markdown" "section" "table" "context_actions"] (mapv :type (:blocks message))))
      (is (= "All done." (:text (first (:blocks message))))))))

(deftest ^:parallel truncation-test
  (testing "an answer past the budget is cut, and the same message explains why (BOT-1606)"
    (let [{:keys [message truncated?]} (slackbot.blocks/message-payloads (repeated 20000 "p") [] feedback conversation-url)
          notice                       (truncation-notice conversation-url)]
      (is (true? truncated?))
      (testing "the answer is cut to the budget, less the room the notice needs"
        (is (= (- markdown-text-limit (notice-length))
               (count (:text message))))
        (is (= (:text message) (:text (first (:blocks message))))))
      (testing "the notice rides in a context block of this message, carrying the copy verbatim"
        (is (= ["markdown" "context" "context_actions"] (mapv :type (:blocks message))))
        (is (= notice (get-in (:blocks message) [1 :elements 0 :text]))))
      (testing "the notice stays out of `:text`, which is replayed back to the model as history"
        (is (not (str/includes? (:text message) "too long to post in Slack"))))
      (testing "feedback buttons still ride the message"
        (is (= "context_actions" (:type (last (:blocks message))))))))
  (testing "the cut is blunt -- straight at the budget, with no boundary seeking"
    (let [answer            (str (repeated 11998 "a") "\n\nsecond paragraph")
          {:keys [message]} (slackbot.blocks/message-payloads answer [] feedback conversation-url)]
      (is (= (subs answer 0 (- markdown-text-limit (notice-length)))
             (:text message)))))
  (testing "an answer exactly at the budget is not truncated"
    (let [{:keys [truncated? message]} (slackbot.blocks/message-payloads
                                        (repeated markdown-text-limit "x") [] feedback conversation-url)]
      (is (false? truncated?))
      (is (= ["markdown" "context_actions"] (mapv :type (:blocks message))))
      (is (nil? (tu/block-rejection (:blocks message)))))))

(deftest ^:parallel prose-competes-with-visualizations-test
  (testing "a large table shrinks the answer rather than getting the message rejected"
    (let [{:keys [message truncated?]} (slackbot.blocks/message-payloads
                                        (repeated 20000 "p") [(big-table)] feedback conversation-url)]
      (is (true? truncated?))
      (is (< (count (:text message)) markdown-text-limit)
          "the answer is cut well below the per-block limit to leave room for the table")
      (is (nil? (tu/block-rejection (:blocks message)))
          "answer plus table stays inside the cumulative budget")))
  (testing "visualizations too large to share a message are dropped with a notice"
    (let [{:keys [message]} (slackbot.blocks/message-payloads "Short." [(big-table) (big-table)] feedback conversation-url)
          blocks            (:blocks message)]
      (is (= ["markdown" "table" "context" "context_actions"] (mapv :type blocks))
          "the second table is dropped and the drop is called out")
      (is (nil? (tu/block-rejection blocks)))))
  (testing "past Slack's block ceiling, visualizations are trimmed from the end"
    (let [{:keys [message]} (slackbot.blocks/message-payloads "Short." (repeat 60 {:type "image"}) feedback conversation-url)
          blocks            (:blocks message)]
      (is (>= tu/slack-max-blocks (count blocks)))
      (is (= ["image" "context" "context_actions"] (mapv :type (take-last 3 blocks))))
      (is (= "markdown" (:type (first blocks)))
          "no answer text is sacrificed to make room"))))

(deftest ^:parallel visualizations-cannot-starve-the-answer-test
  (testing "many small visualizations cannot squeeze the answer down to nothing (review finding)"
    ;; Sized to eat the whole message budget between them if nothing were held back.
    (let [chatty            (vec (repeat 40 {:type "section" :text {:type "mrkdwn" :text (repeated 330 "v")}}))
          {:keys [message]} (slackbot.blocks/message-payloads
                             (repeated 20000 "p") chatty feedback conversation-url)]
      (is (>= (count (:text message)) 1000)
          "the answer keeps a usable share of the budget rather than being cut to a stub")
      (is (some #(= "context" (:type %)) (:blocks message))
          "visualizations are dropped to make that room, and the drop is called out")
      (is (nil? (tu/block-rejection (:blocks message))))))
  (testing "an answer is never reduced to the bare `Query results` preview while it has text"
    (let [{:keys [message]} (slackbot.blocks/message-payloads
                             "A real answer." (vec (repeat 40 (big-table))) feedback conversation-url)]
      (is (= "A real answer." (:text message))))))

(deftest ^:parallel heading-expansion-is-bounded-test
  (testing "headings expand into blocks of their own, so an answer full of them is cut to fit"
    ;; 49 heading/body pairs breach the 50-block ceiling at barely 1000 characters -- well inside
    ;; every text budget, so only a block-aware cut catches this.
    (let [answer                       (str/join "\n" (repeat 60 "## Section\nbody text here"))
          {:keys [message truncated?]} (slackbot.blocks/message-payloads answer [] feedback conversation-url)]
      (is (true? truncated?) "cut for block count, though it is nowhere near the text limit")
      (is (< (count (:text message)) (count answer)))
      (is (nil? (tu/block-rejection (:blocks message))))))
  (testing "thematic breaks count the same way"
    (let [answer            (str/join "\n" (repeat 60 "---\nbody text here"))
          {:keys [message]} (slackbot.blocks/message-payloads answer [] feedback conversation-url)]
      (is (< (count (:text message)) (count answer)))))
  (testing "a handful of headings is left alone"
    (let [answer                       "## One\nbody\n\n## Two\nbody"
          {:keys [message truncated?]} (slackbot.blocks/message-payloads answer [] feedback conversation-url)]
      (is (false? truncated?))
      (is (= answer (:text message))))))

(deftest ^:parallel no-prose-test
  (testing "with no answer text the visualizations are the whole reply, and still carry feedback"
    (let [{:keys [message truncated?]} (slackbot.blocks/message-payloads "" table-viz feedback conversation-url)]
      (is (false? truncated?))
      (is (= ["section" "table" "context_actions"] (mapv :type (:blocks message))))
      (is (not (str/blank? (:text message))) "the notification preview is never empty")
      (is (= slackbot.blocks/viz-only-preview-text (:text message))
          "and it is the shared constant `ignore-msg?` filters back out of replayed history"))))

(deftest ^:parallel every-planned-message-is-deliverable-test
  (testing "whatever the answer and visualizations, Slack would accept the message we plan"
    (doseq [answer [""
                    "Short."
                    (repeated markdown-text-limit "x")
                    (repeated 200000 "z")
                    (str/join "\n\n" (repeat 60 (repeated 500 "x")))
                    (str/join "\n" (repeat 60 "## Section\nbody text here"))
                    (str/join "\n" (repeat 200 "---\nbody"))]
            viz    [[] table-viz [(big-table)] [(big-table) (big-table)]
                    (vec (repeat 60 {:type "image" :alt_text "Visualization"}))
                    (vec (repeat 40 {:type "section" :text {:type "mrkdwn" :text (repeated 330 "v")}}))]]
      (let [{:keys [message]} (slackbot.blocks/message-payloads answer viz feedback conversation-url)]
        (is (nil? (tu/block-rejection (:blocks message)))
            (format "answer=%d chars viz=%d blocks" (count answer) (count viz)))))))

(deftest ^:parallel limits-match-harness-test
  (testing "the production constant and the limit the harness models cannot drift apart"
    (is (= tu/slack-markdown-text-limit markdown-text-limit))))

(deftest ^:parallel truncation-notice-link-test
  (testing "the notice links to the conversation so the full answer is one click away"
    (let [notice (truncation-notice conversation-url)]
      (is (str/includes? notice (str "<" conversation-url "|see it in full in Metabase>"))
          "Slack link syntax, which renders inside a `markdown` block")))
  (testing "the link is offered to whoever asked, not to the whole channel"
    ;; `GET /api/metabot/conversations/:id` read-checks the conversation, so a channel member who
    ;; was not part of it gets a 403 -- the copy must not promise them otherwise.
    (is (str/includes? (truncation-notice conversation-url) "Whoever asked can")))
  (testing "an instance with no site URL still gets a sentence, just without the link"
    (let [notice (truncation-notice nil)]
      (is (str/includes? notice "see it in full in Metabase"))
      (is (not (str/includes? notice "<")) "no dangling link markup")
      (is (not (str/includes? notice "|"))))))
