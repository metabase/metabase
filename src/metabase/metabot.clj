(ns metabase.metabot
  (:require [aleph.http]
            [cheshire.core :as cheshire]
            [clojure.tools.logging :as log]
            [clojure.string :refer [join]]
            [clj-time.core :as t]
            [instaparse.core :as insta]
            (korma [core :as k])
            [manifold.deferred :as d]
            [manifold.stream :as s]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.integrations.slack :refer [metabot-enabled? chat-post-message get-websocket-url]]
            (metabase.models [database :refer [Database]]
                             [hydrate :refer [hydrate]])
            [metabase.task.send-pulses :refer [send-pulse-slack]]))

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
  equal = column whitespace <'=' | '==' | 'is' | 'equals' | 'equal to' | 'is equal to'> whitespace value

  limit = number
  <pre-limit> = <'top' whitespace>? limit <whitespace 'rows of'>?
  <post-limit> = <'limit'> whitespace limit

  <value> = identifier | number
  <whitespace> = <#'(,|\\s)+'>
  <identifier> = #'[a-zA-Z]+'
  number = #'[0-9]+'")

(def generic-grammar
  "source_table = identifier
  <column> = identifier")

(defn parser
  [s]
  ((insta/parser (str base-grammar "\n" generic-grammar)) s))

(defn- get-tables
  []
  (let [dbs    (-> (sel :many Database) (hydrate [:tables [:fields :target]]))
        tables (mapcat (fn [db] (:tables db)) dbs)]
    (filter #(> (count (:fields %)) 0) tables)))

(defn- entity-name-clause
  [entity]
  (join " | " (map #(str "'" % "'") [(:name entity) (:display_name entity)])))

(defn parse-with-parser
  [input parser]
  (let [result (parser input)]
    (if (insta/failure? result)
      result
      (->> result
          (insta/transform {:query (fn [& rest] (into {} rest))
                            :column #(-> % (first) (name) (subs 7) (read-string)) ; strip off "column_" and parse id
                            :breakout (fn [& rest] [:breakout (into [] rest)])
                            :sum #(-> ["sum" %])
                            :avg #(-> ["avg" %])
                            :count #(-> ["count"])
                            :equal #(-> ["=" %1 %2])
                            :number read-string})
          (merge {:aggregation ["rows"] :breakout [] :filter []})))))

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
  (log/info (str "🤖 COMMAND: " command))
  (try
    (let [parsed        (parse-with-table-metadata command)
          dataset_query (first parsed)
          fake-card     {:id 0 :name "" :dataset_query dataset_query}
          result        {:card fake-card :result (driver/dataset-query dataset_query {:executed_by 1})}]
      ; (chat-post-message channel (str "```\n" (cheshire/generate-string parsed {:pretty true}) "\n```"))
      (send-pulse-slack {:id 0 :name "🤖"} [result] {:channel channel}))
  (catch Throwable e
    (log/warn (str e))
    (chat-post-message channel "Sorry, an error occured."))))

(defn start
  []
  (let [ws-url     (get-websocket-url)
        stream     @(aleph.http/websocket-client ws-url)
        start-time (t/plus (t/now) (t/seconds 1))]
    @(d/loop []
      (d/chain (s/take! stream ::drained)

        ;; if we got a message, process it
        (fn [msg]
          (log/info msg)
          (cond
            (t/before? (t/now) start-time) ::initializing ; skip initial messages since it replays the last message
            (not (metabot-enabled?))       ::disabled
            (identical? ::drained msg)     ::drained
            :else (try
                    (let [body (-> (cheshire/parse-string msg) (clojure.walk/keywordize-keys))
                          command (second (re-matches #"(?i)@?(?:mb|metabot)\W(.*)" (or (:text body) "")))]
                      (if (and (= (:type body) "message") command)
                        (process-metabot-command (:channel body) command)
                        (log/info msg)))
                  (catch Throwable e
                    (log/warn (str e))))))

        ;; wait for the result from `f` to be realized, and
        ;; recur, unless the stream is already drained
        (fn [result]
          (when-not (or (identical? ::disabled result) (identical? ::drained result))
            (d/recur)))))))

(defn start-metabot!
  []
  (future (loop []
            (if (metabot-enabled?)
              (try
                (log/info "🤖 Metabot Starting...")
                (start)
              (catch Throwable e
                (log/warn (str "🤖 Metabot terminated: " e))
                (Thread/sleep 10000))))
            (Thread/sleep 1000)
            (recur))))
