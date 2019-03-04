(ns metabase.metabot.test-util
  (:require [medley.core :as m]
            [metabase.metabot.slack :as metabot.slack]
            [metabase.pulse :as pulse]))

(defn do-with-slack-messages [f]
  (let [messages (atom [])]
    (with-redefs [metabot.slack/post-chat-message!
                  (fn [& args]
                    (swap! messages conj (cons 'post-chat-message! args))
                    nil)

                  pulse/create-and-upload-slack-attachments!
                  (fn [& args]
                    (cons 'create-and-upload-slack-attachments! args))

                  pulse/create-slack-attachment-data
                  (fn [card-results]
                    (list 'create-slack-attachment-data
                          (for [result card-results]
                            (m/map-vals class result))))

                  ;; this is bascially the same as the real implementation but doesn't do things in a future, and
                  ;; doesn't log errors
                  metabot.slack/do-async
                  (fn [f]
                    (try
                      (f)
                      nil
                      (catch Throwable e
                        (metabot.slack/post-chat-message!
                         (#'metabot.slack/format-exception e)))))]

      (if-let [response (f)]
        {:response response, :messages @messages}
        @messages))))

(defmacro with-slack-messages
  "Execute body with the functions that post to Slack mocked, returning a sequence of all fncalls to relevant functions
  like `post-chat-message!`. Use this to write tests for the MetaBot without actually having to worry about setting up
  Slack!"
  [& body]
  `(do-with-slack-messages (fn [] ~@body)))
