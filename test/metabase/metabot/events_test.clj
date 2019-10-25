(ns metabase.metabot.events-test
  (:require [cheshire.core :as json]
            [expectations :refer [expect]]
            [metabase.metabot
             [command :as metabot.cmd]
             [events :as metabot.events]
             [slack :as metabot.slack]
             [test-util :as metabot.test.u]]))

;; check that things get parsed correctly
(expect
  '(show 100)
  (#'metabot.events/str->tokens "show 100"))

(expect
  '(show "Birdwatching Hot Spots")
  (#'metabot.events/str->tokens "show \"Birdwatching Hot Spots\""))

(expect
  '(SHOW :wow)
  (#'metabot.events/str->tokens "SHOW :wow"))

(defn- handle-slack-event [event]
  (metabot.test.u/with-slack-messages
    (metabot.events/handle-slack-event
     1000000
     (json/generate-string
      (merge {:type "message", :ts "1001"} event)))))

;; MetaBot shouldn't handle events that aren't of type "message"
(expect
  []
  (handle-slack-event {:text "metabot list", :type "not_a_message"}))

;; MetaBot shouldn't handle "message" events if the subtype is something like "bot_message"
(expect
  []
  (handle-slack-event {:text "metabot list", :subtype "bot_message"}))

;; MetaBot shouldn't handlle events if they were posted after the MetaBot start time
(expect
  []
  (handle-slack-event {:text "metabot list", :ts "999"}))

;; MetaBot shouldn't handle events that don't start with metabot
(expect
  []
  (handle-slack-event {:text "metabase list"}))

;; Make sure the message CHANNEL gets bound correctly!
(expect
  '[(post-chat-message! "#she-watch-channel-zero")]
  (with-redefs [metabot.cmd/command (fn [& _] @#'metabot.slack/*channel-id*)]
    (handle-slack-event {:text "metabot list", :channel "#she-watch-channel-zero"})))

;; (but we should allow misspellings like `metaboat` or `meatbot` :scream_cat:
(expect
  '[(post-chat-message! "OK")]
  (with-redefs [metabot.cmd/command (constantly "OK")]
    (handle-slack-event {:text "meatbot list"})))

(expect
  '[(post-chat-message! "OK")]
  (with-redefs [metabot.cmd/command (constantly "OK")]
    (handle-slack-event {:text "metaboat list"})))

;; If the command function returns a string, we should post that directly as a chat message
(expect
  '[(post-chat-message! "(command list)")]
  (with-redefs [metabot.cmd/command (fn [& args] (str (cons 'command args)))]
    (handle-slack-event {:text "metabot list"})))

;; command strings should get parsed correctly as if they were EDN
(expect
  [(list
    'post-chat-message!
    (str "(command \"class clojure.lang.Symbol symbol\""
         " \"class java.lang.Double 1.0\""
         " \"class java.lang.Long 2\""
         " \"class clojure.lang.Keyword :keyword\""
         " \"class java.lang.String String\")"))]
  (with-redefs [metabot.cmd/command (fn [& args]
                                      (str (cons 'command (for [arg args]
                                                            (str (class arg) " " arg)))))]
    (handle-slack-event {:text "metabot symbol 1.0 2 :keyword \"String\""})))

;; if the command function returns something other than a string, we should post that as a code block
(expect
  '[(post-chat-message! "```\n(command list)\n```")]
  (with-redefs [metabot.cmd/command (fn [& args]
                                      (cons 'command args))]
    (metabot.test.u/with-slack-messages
      (#'metabot.events/handle-slack-message {:text "metabot list"}))))

;; if the command function sends stuff async, that should get posted
(expect
  '[(post-chat-message! "HERE ARE YOUR RESULTZ" "[attachment]")
    (post-chat-message! "Just a second...")]
  (with-redefs [metabot.cmd/command (fn [& args]
                                      (metabot.slack/async
                                        (metabot.slack/post-chat-message! "HERE ARE YOUR RESULTZ" "[attachment]"))
                                      "Just a second...")]
    (handle-slack-event {:text "metabot list"})))

;; if the command function throws an Exception, we should post an 'Uh-oh' message
(expect
  '[(post-chat-message! "Uh oh! :cry:\n> Sorry, maybe next time!")]
  (with-redefs [metabot.cmd/command (fn [& args]
                                      (throw (Exception. "Sorry, maybe next time!")))]
    (handle-slack-event {:text "metabot list"})))
