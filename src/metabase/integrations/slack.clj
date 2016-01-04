(ns metabase.integrations.slack
  (:require [aleph.http]
            [cheshire.core :as cheshire]
            [clj-http.lite.client :as client]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [clojure.string :refer [join]]
            [instaparse.core :as insta]
            (korma [core :as k])
            [manifold.deferred :as d]
            [manifold.stream :as s]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [hydrate :refer [hydrate]]
                             [setting :refer [defsetting]])
            [metabase.task.send-pulses :refer [send-pulse-slack]]))

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

(def base-grammar
  "query = whitespace? (preamble whitespace)? (aggregation whitespace)? (pre-limit whitespace)? source_table (whitespace breakout)? (whitespace filter)? (whitespace post-limit)? whitespace?

  <preamble> = <'show me' | 'show' | 'display' | 'graph' | 'chart'>

  aggregation = count | sum | avg
  count = <'count of' | 'how many'>
  sum = <'sum'> aggregation-target
  avg = <'average'> aggregation-target
  <aggregation-target> = <whitespace 'of' whitespace> column <whitespace 'in'>

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

  <value> = identifier | number
  <whitespace> = <#'(,|\\s)+'>
  <identifier> = #'[a-zA-Z]+'
  number = #'[0-9]+'")

; source_table = identifier
; <column> = identifier

(defn parser
  [s]
  ((insta/parser (str base-grammar "\nsource_table = identifier\n<column> = identifier")) s))

(parser "top 10 users grouped by asdf where id is 10")

(defn- get-tables
  []
  (let [dbs    (-> (sel :many Database (k/order :name)) (hydrate [:tables [:fields :target]]))
        tables (mapcat (fn [db] (:tables db)) dbs)]
    (filter #(> (count (:fields %)) 0) tables)))

(defn- entity-name-clause
  [entity]
  (join " | " (map #(str "'" % "'") [(:name entity) (:display_name entity)])))

(defn parse-with-parser
  [input parser]
  (let [sexprs (parser input)]
    (if (insta/failure? sexprs)
      sexprs
      (->> sexprs
          (insta/transform {:query (fn [& rest] (into {} rest))
                            :column (fn [col]
                              (-> col (first) (name) (subs 7) (read-string)))
                            :breakout (fn [& rest] [:breakout (into [] rest)])
                            :sum #(-> ["sum" %])
                            :avg #(-> ["avg" %])
                            :count #(-> ["count"])
                            :number read-string})
          (merge { :aggregation ["rows"] :breakout [] :filter [] })))))

(defn- parser-for-table
  [table]
  (let [source-table-clause (str "source_table = " (entity-name-clause table))
        column-clause       (str "column = " (join " | " (map #(str "column_" (:id %)) (:fields table))))
        column-clauses      (map #(str "column_" (:id %) " = " (entity-name-clause %)) (:fields table))
        full-grammar        (str base-grammar "\n" source-table-clause "\n" column-clause "\n" (join "\n" column-clauses))
        parser              (insta/parser full-grammar :string-ci true)]
    (fn
      [input]
      (let [result (parse-with-parser input parser)]
        (if (insta/failure? result)
          result
          {:database (:db_id table)
           :query (merge result {:source_table (:id table)})
           :type "query"})))))

(defn parse-with-table-metadata
  [input]
  (let [tables (get-tables)
        parsers (map parser-for-table tables)]
    (filter #(not (insta/failure? %)) (map #(% input) parsers))))

(defn- process-metabot-command
  [channel command]
  (let [parsed (parse-with-table-metadata command)
        dataset_query (first parsed)
        fake-card {:id 0 :name "" :dataset_query dataset_query}
        result {:card fake-card :result (driver/dataset-query dataset_query {:executed_by 1})}]
    (chat-post-message channel (str "```\n" (cheshire/generate-string parsed {:pretty true}) "\n```"))
    (send-pulse-slack {:id 0 :name ""} [result] {:channel channel})))

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
