(ns metabase.slackbot.blocks-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.slackbot.blocks :as slackbot.blocks]
   [metabase.slackbot.test-util :as tu]))

(set! *warn-on-reflection* true)

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

(deftest ^:parallel fits-in-one-message-test
  (testing "an answer within budget is posted whole, in one message, untouched"
    (let [{:keys [messages truncated?]} (slackbot.blocks/message-payloads "All done." table-viz feedback conversation-url)
          [answer] messages]
      (is (false? truncated?))
      (is (= 1 (count messages)))
      (is (= "All done." (:text answer)))
      (is (= ["markdown" "section" "table" "context_actions"] (mapv :type (:blocks answer))))
      (is (= "All done." (:text (first (:blocks answer))))))))

(deftest ^:parallel truncation-test
  (testing "an answer past the budget is cut, and a second message explains why (BOT-1606)"
    (let [{:keys [messages truncated?]} (slackbot.blocks/message-payloads (repeated 20000 "p") [] feedback conversation-url)
          [answer notice] messages]
      (is (true? truncated?))
      (is (= 2 (count messages)))
      (testing "the answer is cut to exactly the budget"
        (is (= slackbot.blocks/markdown-text-limit (count (:text answer))))
        (is (= slackbot.blocks/markdown-text-limit (count (:text (first (:blocks answer)))))))
      (testing "the notice is a message of its own, carrying the reviewed copy verbatim"
        (is (= (slackbot.blocks/truncation-notice conversation-url) (:text notice)))
        (is (= [{:type "markdown" :text (slackbot.blocks/truncation-notice conversation-url)}]
               (:blocks notice))))
      (testing "feedback buttons ride the answer, not the notice"
        (is (= "context_actions" (:type (last (:blocks answer)))))
        (is (not-any? #(= "context_actions" (:type %)) (:blocks notice))))))
  (testing "the cut is blunt -- exactly at the budget, with no boundary seeking"
    (let [answer             (str (repeated 11998 "a") "\n\nsecond paragraph")
          {:keys [messages]} (slackbot.blocks/message-payloads answer [] feedback conversation-url)]
      (is (= (subs answer 0 slackbot.blocks/markdown-text-limit)
             (:text (first messages))))))
  (testing "an answer exactly at the budget is not truncated"
    (let [{:keys [truncated? messages]} (slackbot.blocks/message-payloads
                                         (repeated slackbot.blocks/markdown-text-limit "x") [] feedback conversation-url)]
      (is (false? truncated?))
      (is (= 1 (count messages))))))

(deftest ^:parallel prose-competes-with-visualizations-test
  (testing "a large table shrinks the answer rather than getting the message rejected"
    (let [{:keys [messages truncated?]} (slackbot.blocks/message-payloads
                                         (repeated 20000 "p") [(big-table)] feedback conversation-url)
          answer (first messages)]
      (is (true? truncated?))
      (is (< (count (:text answer)) slackbot.blocks/markdown-text-limit)
          "the answer is cut well below the per-block limit to leave room for the table")
      (is (nil? (tu/block-rejection (:blocks answer)))
          "answer plus table stays inside the cumulative budget")))
  (testing "visualizations too large to share a message are dropped with a notice"
    (let [{:keys [messages]} (slackbot.blocks/message-payloads "Short." [(big-table) (big-table)] feedback conversation-url)
          blocks (:blocks (first messages))]
      (is (= ["markdown" "table" "context" "context_actions"] (mapv :type blocks))
          "the second table is dropped and the drop is called out")
      (is (nil? (tu/block-rejection blocks)))))
  (testing "past Slack's block ceiling, visualizations are trimmed from the end"
    (let [{:keys [messages]} (slackbot.blocks/message-payloads "Short." (repeat 60 {:type "image"}) feedback conversation-url)
          blocks (:blocks (first messages))]
      (is (= tu/slack-max-blocks (count blocks)))
      (is (= ["image" "context" "context_actions"] (mapv :type (take-last 3 blocks))))
      (is (= "markdown" (:type (first blocks)))
          "no answer text is sacrificed to make room"))))

(deftest ^:parallel no-prose-test
  (testing "with no answer text the visualizations are the whole reply, and still carry feedback"
    (let [{:keys [messages truncated?]} (slackbot.blocks/message-payloads "" table-viz feedback conversation-url)
          answer (first messages)]
      (is (false? truncated?))
      (is (= ["section" "table" "context_actions"] (mapv :type (:blocks answer))))
      (is (not (str/blank? (:text answer))) "the notification preview is never empty"))))

(deftest ^:parallel every-planned-message-is-deliverable-test
  (testing "whatever the answer and visualizations, Slack would accept every message we plan"
    (doseq [answer [""
                    "Short."
                    (repeated slackbot.blocks/markdown-text-limit "x")
                    (repeated 200000 "z")
                    (str/join "\n\n" (repeat 60 (repeated 500 "x")))]
            viz    [[] table-viz [(big-table)] [(big-table) (big-table)] (vec (repeat 60 {:type "image"}))]]
      (doseq [{:keys [blocks]} (:messages (slackbot.blocks/message-payloads answer viz feedback conversation-url))]
        (is (nil? (tu/block-rejection blocks))
            (format "answer=%d chars viz=%d blocks" (count answer) (count viz)))))))

(deftest ^:parallel limits-match-harness-test
  (testing "the production constant and the limit the harness models cannot drift apart"
    (is (= tu/slack-markdown-text-limit slackbot.blocks/markdown-text-limit))))

(deftest ^:parallel truncation-notice-link-test
  (testing "the notice links to the conversation so the full answer is one click away"
    (let [notice (slackbot.blocks/truncation-notice conversation-url)]
      (is (str/includes? notice (str "<" conversation-url "|open this conversation in Metabase>"))
          "Slack link syntax, which renders inside a `markdown` block")))
  (testing "an instance with no site URL still gets a sentence, just without the link"
    (let [notice (slackbot.blocks/truncation-notice nil)]
      (is (str/includes? notice "open this conversation in Metabase"))
      (is (not (str/includes? notice "<")) "no dangling link markup")
      (is (not (str/includes? notice "|"))))))
