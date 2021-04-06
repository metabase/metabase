(ns metabase.metabot.events-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.metabot.command :as metabot.cmd]
            [metabase.metabot.events :as metabot.events]
            [metabase.metabot.slack :as metabot.slack]
            [metabase.metabot.test-util :as metabot.test.u]))

(deftest str->tokens-test
  (testing "check that things get parsed correctly"
    (is (= '(show 100)
           (#'metabot.events/str->tokens "show 100")))
    (is (= '(show "Birdwatching Hot Spots")
           (#'metabot.events/str->tokens "show \"Birdwatching Hot Spots\"")))
    (is (= '(SHOW :wow)
           (#'metabot.events/str->tokens "SHOW :wow")))))

(defn- handle-slack-event [event]
  (metabot.test.u/with-slack-messages
    (metabot.events/handle-slack-event
     1000000
     (json/generate-string
      (merge {:type "message", :ts "1001"} event)))))

(deftest ignore-non-message-events-test
  (testing "MetaBot shouldn't handle events that aren't of type \"message\""
           (is (= []
                  (handle-slack-event {:text "metabot list", :type "not_a_message"})))))

(deftest ignore-bot-message-events-test
  (testing "MetaBot shouldn't handle \"message\" events if the subtype is something like \"bot_message\""
           (is (= []
                  (handle-slack-event {:text "metabot list", :subtype "bot_message"})))))

(deftest ignore-old-messages-test
  (testing "MetaBot shouldn't handle events if they were posted after the MetaBot start time"
    (is (= []
           (handle-slack-event {:text "metabot list", :ts "999"})))))

(deftest ignore-non-metabot-events-test
  (testing "MetaBot shouldn't handle events that don't start with metabot"
    (is (= []
           (handle-slack-event {:text "metabase list"})))))

(deftest channel-test
  (testing "Make sure the message CHANNEL gets bound correctly!"
    (with-redefs [metabot.cmd/command (fn [& _] @#'metabot.slack/*channel-id*)]
      (is (= '[(post-chat-message! "#she-watch-channel-zero")]
             (handle-slack-event {:text "metabot list", :channel "#she-watch-channel-zero"}))))

    (testing "(but we should allow misspellings like `metaboat` or `meatbot` :scream_cat:"
      (with-redefs [metabot.cmd/command (constantly "OK")]
        (is (= '[(post-chat-message! "OK")]
               (handle-slack-event {:text "meatbot list"})))
        (is (= '[(post-chat-message! "OK")]
               (handle-slack-event {:text "metaboat list"})))))))

(deftest string-response-test
  (testing "If the command function returns a string, we should post that directly as a chat message"
    (with-redefs [metabot.cmd/command (fn [& args] (str (cons 'command args)))]
      (is (= '[(post-chat-message! "(command list)")]
             (handle-slack-event {:text "metabot list"}))))))

(deftest parse-edn-test
  (testing "command strings should get parsed correctly as if they were EDN"
    (with-redefs [metabot.cmd/command (fn [& args]
                                        (str (cons 'command (for [arg args]
                                                              (str (class arg) " " arg)))))]
      (is (= [(list
               'post-chat-message!
               (str "(command \"class clojure.lang.Symbol symbol\""
                    " \"class java.lang.Double 1.0\""
                    " \"class java.lang.Long 2\""
                    " \"class clojure.lang.Keyword :keyword\""
                    " \"class java.lang.String String\")"))]
             (handle-slack-event {:text "metabot symbol 1.0 2 :keyword \"String\""}))))))

(deftest code-block-response-test
  (testing "if the command function returns something other than a string, we should post that as a code block"
    (with-redefs [metabot.cmd/command (fn [& args]
                                        (cons 'command args))]
      (is (= '[(post-chat-message! "```\n(command list)\n```")]
             (metabot.test.u/with-slack-messages
               (#'metabot.events/handle-slack-message {:text "metabot list"})))))))

(deftest async-test
  (testing "if the command function sends stuff async, that should get posted"
    (with-redefs [metabot.cmd/command (fn [& args]
                                        (metabot.slack/async
                                         (metabot.slack/post-chat-message! "HERE ARE YOUR RESULTZ" "[attachment]"))
                                        "Just a second...")]
      (is (= '[(post-chat-message! "HERE ARE YOUR RESULTZ" "[attachment]")
               (post-chat-message! "Just a second...")]
             (handle-slack-event {:text "metabot list"}))))))

(deftest exception-test
  (testing "if the command function throws an Exception, we should post an 'Uh-oh' message"
    (with-redefs [metabot.cmd/command (fn [& args]
                                        (throw (Exception. "Sorry, maybe next time!")))]
      (is (= '[(post-chat-message! "Uh oh! :cry:\n> Sorry, maybe next time!")]
             (handle-slack-event {:text "metabot list"}))))))
