(ns metabase.metabot.tools.slackbot-query-test
  "Tests for slackbot query tool schema and prompt content."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.json-schema :as mjs]
   [metabase.metabot.tools.slackbot-query :as slackbot-query]))

;;; ---------------------------------------- prompt content tests ---------------------------------------------------

(deftest slackbot-prompt-display-guidance-test
  (testing "slackbot prompt contains display-related guidance"
    (let [prompt (slurp (io/resource "metabot/prompts/system/slackbot.selmer"))]
      (is (str/includes? prompt "Set `display` explicitly for Slackbot charts."))
      (is (str/includes? prompt "Do not omit `display` for chart or graph requests.")))))

(deftest slackbot-prompt-narration-guidance-test
  (testing "slackbot prompt contains updated narration guidance"
    (let [prompt (slurp (io/resource "metabot/prompts/system/slackbot.selmer"))]
      (is (str/includes? prompt "Default to no pre-tool text at all."))
      (is (str/includes? prompt "Minimal Commentary for Query/Chart Requests")))))

;;; ---------------------------------------- schema tests -----------------------------------------------------------

(deftest display-field-has-description-test
  (testing "display field in slackbot-query-schema has a description in JSON Schema"
    (let [schema  @#'slackbot-query/slackbot-query-schema
          json-schema (mjs/transform schema)
          display-prop (get-in json-schema [:properties :display])]
      (is (some? (:description display-prop))
          "display field should have a :description in the JSON schema")
      (is (str/includes? (:description display-prop) "Visualization type")
          "description should mention 'Visualization type'"))))

(deftest display-field-is-optional-test
  (testing "display field is not in the required list"
    (let [schema  @#'slackbot-query/slackbot-query-schema
          json-schema (mjs/transform schema)
          required (set (:required json-schema))]
      (is (not (contains? required "display"))
          "display should not be required"))))
