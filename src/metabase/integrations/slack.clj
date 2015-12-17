(ns metabase.integrations.slack
  (:require [aleph.http]
            [cheshire.core :as cheshire]
            [clj-http.lite.client :as client]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [instaparse.core :as insta]
            [manifold.deferred :as d]
            [manifold.stream :as s]
            [metabase.models.setting :refer [defsetting]]))


;; Define a setting which captures our Slack api token
(defsetting slack-token "Slack API bearer token obtained from https://api.slack.com/web#authentication")

(def ^:const slack-api-baseurl "https://slack.com/api")


(defn slack-configured?
  "Predicate function which returns `true` if the application has a valid integration with Slack, `false` otherwise."
  []
  (not (empty? (slack-token))))


(defn slack-api-get
  "Generic function which calls a given method on the Slack api via HTTP GET."
  ([token method]
    (slack-api-get token method {}))
  ([token method params]
    {:pre [(string? method)
           (map? params)]}
   (when token
     (try
       (client/get (str slack-api-baseurl "/" method) {:query-params   (merge params {:token token})
                                                       :conn-timeout   1000
                                                       :socket-timeout 1000})
       (catch Throwable t
         (log/warn "Error making Slack API call:" (.getMessage t)))))))

(defn slack-api-post
  "Generic function which calls a given method on the Slack api via HTTP POST."
  ([token method]
   (slack-api-get token method {}))
  ([token method params]
   {:pre [(string? method)
          (map? params)]}
   (when token
     (try
       (client/post (str slack-api-baseurl "/" method) {:form-params   (merge params {:token token})
                                                        :conn-timeout   1000
                                                        :socket-timeout 1000})
       (catch Throwable t
         (log/warn "Error making Slack API call:" (.getMessage t)))))))

(defn- ^:private handle-api-response
  "Simple helper that checks that response is a HTTP 200 and deserializes the `:body` if so, otherwise logs an error"
  [response]
  (if (= 200 (:status response))
    (cheshire/parse-string (:body response))
    (log/warn "Error in Slack api response:" (with-out-str (clojure.pprint/pprint response)))))

(defn channels-list
  "Calls Slack api `channels.list` function and returns the list of available channels."
  []
  (-> (slack-api-get (slack-token) "channels.list" {:exclude_archived 1})
      (handle-api-response)))

(defn users-list
  "Calls Slack api `users.list` function and returns the list of available users."
  []
  (-> (slack-api-get (slack-token) "users.list")
      (handle-api-response)))

(defn files-upload
  "Calls Slack api `files.upload` function and returns the url of the uploaded file."
  [file]
  (let [response (http/post (str slack-api-baseurl "/files.upload") {:multipart [["token" (slack-token)]
                                                                                 ["file" file]]
                                                                     :as :json})]
    (if (= 200 (:status response))
      (:body response)
      (log/warn "Error uploading file to Slack:" (with-out-str (clojure.pprint/pprint response))))))

(defn chat-post-message
  "Calls Slack api `chat.postMessage` function and posts a message to a given channel."
  ([channel text]
    (chat-post-message channel text []))
  ([channel text attachments]
   {:pre [(string? channel)
          (string? text)]}
    ;; TODO: it would be nice to have an emoji or icon image to use here
   (-> (slack-api-post (slack-token) "chat.postMessage" {:channel     channel
                                                         :username    "MetaBot"
                                                         :icon_url    "http://static.metabase.com/mb_slack_avatar.png"
                                                         :text        text
                                                         :attachments attachments})
       (handle-api-response))))

(defn websocket-url
  []
  (-> (slack-api-get (slack-token) "rtm.start")
      (handle-api-response)
      (get "url")))

(defn parser [str] (insta/parses (insta/parser "
  command = query | show

  show = <'show'> ('tables' | 'databases')
  query = whitespace? (preamble whitespace)? (aggregation whitespace)? (pre-limit whitespace)? table (whitespace breakout)? (whitespace filter)? (whitespace post-limit)? whitespace?

  <preamble> = <'show me' | 'show' | 'display' | 'graph' | 'chart'>

  aggregation = count | sum | avg
  count = <'count of' | 'how many'>
  sum = <'sum'> aggregation-target
  avg = <'average'> aggregation-target
  <aggregation-target> = <whitespace 'of' whitespace> column <whitespace 'in'>

  table = identifier

  breakout = <('group'|'grouped') whitespace>? <'by' whitespace> column (<whitespace 'and' whitespace> column)?

  filter = <'filtered by' | 'when' | 'where' | 'with'> whitespace filter-clause
  <filter-clause> = and | or | equal | filter-grouping
  <filter-grouping> = <'('> filter-clause <')'>
  and = filter-clause (whitespace <'and'> whitespace filter-clause)+
  or = filter-clause (whitespace <'or'> whitespace filter-clause)+
  equal = value whitespace <'=' | '==' | 'is' | 'equals' | 'equal to' | 'is equal to'> whitespace value

  limit = number
  <pre-limit> = <'top' whitespace>? limit <whitespace 'rows of'>?
  <post-limit> = <'limit'> whitespace limit

  <column> = identifier
  <value> = identifier | number
  <whitespace> = <#'\\s+'>
  <identifier> = #'[a-zA-Z]+'
  <number> = #'[0-9]+'
  ") str))

(parser "top 10 users grouped by asdf where id is 10")

(defn- process-metabot-command
  [channel command]
  (chat-post-message channel (cheshire/generate-string (parser command) {:pretty true})))

(defn start-metabot
  []
  (let [ws-url (websocket-url)
        stream @(aleph.http/websocket-client ws-url)]
    @(d/loop []
      (d/chain (s/take! stream ::drained)

        ;; if we got a message, process it
        (fn [msg]
          (if (identical? ::drained msg)
            ::drained
            (let [body (-> (cheshire/parse-string msg) (clojure.walk/keywordize-keys))
                  command (second (re-matches #"(?i).*@metabot\W(.*)" (or (:text body) "")))]
              (if (and (= (:type body) "message") command)
                (process-metabot-command (:channel body) command)
                (log/info msg)))))

        ;; wait for the result from `f` to be realized, and
        ;; recur, unless the stream is already drained
        (fn [result]
          (when-not (identical? ::drained result)
            (d/recur)))))))
