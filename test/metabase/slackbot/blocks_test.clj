(ns metabase.slackbot.blocks-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.slackbot.blocks :as slackbot.blocks]
   [metabase.slackbot.test-util :as tu]))

(set! *warn-on-reflection* true)

(defn- text-blocks
  "The section texts `final-text-blocks` builds for `text`."
  [text]
  (mapv #(get-in % [:text :text]) (slackbot.blocks/final-text-blocks text)))

(deftest ^:parallel final-text-blocks-test
  (testing "blank text produces no blocks"
    (is (= [] (text-blocks "")))
    (is (= [] (text-blocks "   "))))
  (testing "text within Slack's limit is left alone"
    (is (= ["Here is your answer"] (text-blocks "Here is your answer"))))
  (testing "long text splits on paragraph boundaries, keeping every paragraph intact"
    (let [paragraphs (mapv #(apply str (repeat 1000 %)) ["a" "b" "c" "d" "e"])
          blocks     (text-blocks (str/join "\n\n" paragraphs))]
      (is (< 1 (count blocks)))
      (is (every? #(<= (count %) tu/slack-section-text-limit) blocks))
      (is (= paragraphs (mapcat #(str/split % #"\n\n") blocks))
          "no paragraph is cut in half")))
  (testing "a single run longer than the limit is hard cut rather than dropped"
    (let [blocks (text-blocks (apply str (repeat 7000 "x")))]
      (is (= [3000 3000 1000] (mapv count blocks)))))
  (testing "text past the block cap is truncated with a notice instead of silently dropped"
    (let [blocks (text-blocks (str/join "\n\n" (repeat 25 (apply str (repeat 2900 "y")))))]
      ;; 20 blocks of answer plus the notice, which gets a block of its own.
      (is (= 21 (count blocks)))
      (is (= "_Response truncated._" (last blocks))))))

(deftest ^:parallel cap-blocks-test
  (let [section  (fn [i] {:type "section" :text {:type "mrkdwn" :text (str i)}})
        text     (mapv section (range 20))
        feedback [{:type "context_actions"}]
        viz      #(vec (repeat % {:type "table"}))]
    (testing "everything fits, so nothing is dropped and the order is text, viz, feedback"
      (let [blocks (slackbot.blocks/cap-blocks text (viz 5) feedback)]
        (is (= 26 (count blocks)))
        (is (= (concat (repeat 20 "section") (repeat 5 "table") ["context_actions"])
               (map :type blocks)))))
    (testing "past Slack's 50 block ceiling, visualizations are trimmed from the end"
      (let [blocks (slackbot.blocks/cap-blocks text (viz 40) feedback)]
        (is (= 50 (count blocks))
            "the message lands exactly on the ceiling instead of being rejected")
        (is (= ["table" "context" "context_actions"] (mapv :type (take-last 3 blocks)))
            "the drop is called out, and the feedback block still comes last")
        (is (= 20 (count (filter #(= "section" (:type %)) blocks)))
            "no answer text is sacrificed to make room")))
    (testing "a truncated answer costs one more block, and the cap still holds"
      (let [blocks (slackbot.blocks/cap-blocks (conj text (section "_Response truncated._"))
                                               (viz 40) feedback)]
        (is (= 50 (count blocks)))))
    (testing "with no visualizations the ceiling never comes into play"
      (is (= 21 (count (slackbot.blocks/cap-blocks text [] feedback)))))))

(deftest ^:parallel section-text-limit-matches-slack-test
  (testing "the production constant tracks the limit the test harness models"
    (is (= tu/slack-section-text-limit slackbot.blocks/section-text-limit))))
