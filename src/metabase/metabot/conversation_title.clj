(ns metabase.metabot.conversation-title
  "Generate and persist short titles for Metabot conversations."
  (:require
   [clojure.string :as str]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent
    ArrayBlockingQueue
    Callable
    ExecutionException
    ExecutorService
    Future
    RejectedExecutionException
    ThreadFactory
    ThreadPoolExecutor
    TimeoutException
    TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private executor-pool-size 4)

(def ^:private executor-queue-capacity 100)

(def ^:private idle-timeout-ms
  30000)

(def ^:private title-timeout-ms
  30000)

(def ^:private title-max-chars
  80)

(def ^:private title-json-schema
  {:type       "object"
   :properties {:title {:type        "string"
                        :description "A short title for the conversation. No quotes or extra explanation."}}
   :required   ["title"]
   :additionalProperties false})

(defonce ^:private title-executor
  (delay
    (doto (ThreadPoolExecutor.
           (int executor-pool-size)
           (int executor-pool-size)
           (long idle-timeout-ms) TimeUnit/MILLISECONDS
           (ArrayBlockingQueue. (int executor-queue-capacity))
           (reify ThreadFactory
             (newThread [_ r]
               (doto (Thread. r)
                 (.setName "metabot-title-generator")
                 (.setDaemon true)))))
      (.allowCoreThreadTimeOut true))))

(defn- title-prompt
  [message]
  (str "Generate a concise title for this chat conversation.\n\n"
       "Rules:\n"
       "- Use 2 to 6 words.\n"
       "- Do not wrap the title in quotes.\n"
       "- Do not include punctuation at the end.\n"
       "- Do not include any extra explanation.\n\n"
       "User's first message:\n"
       message))

(defn- clean-title
  [title]
  (when (string? title)
    (let [cleaned (-> title
                      str/trim
                      (str/replace #"[\r\n]+" " ")
                      (str/replace #"\s+" " ")
                      (str/replace #"^[\"']+|[\"']+$" "")
                      (str/replace #"[.!?]+$" "")
                      str/trim)]
      (when-not (str/blank? cleaned)
        (subs cleaned 0 (min title-max-chars (count cleaned)))))))

(defn- generate!
  "Generate and persist a title for `conversation-id`, returning it only if it was saved."
  [conversation-id profile-id message]
  (when (and conversation-id (not (str/blank? message)))
    (let [response (metabot.self/call-llm-structured
                    (metabot.settings/llm-metabot-provider)
                    [{:role "user" :content (title-prompt message)}]
                    title-json-schema
                    nil
                    128
                    {:request-id  (str (random-uuid))
                     :session-id  conversation-id
                     :profile-id  profile-id
                     :source      "metabot_conversation_title"
                     :tag         "conversation-title"})
          title    (clean-title (:title response))]
      (when title
        (when (pos? (long (or (metabot.persistence/set-conversation-title-if-missing! conversation-id title)
                              0)))
          title)))))

(defn ^Future submit!
  "Start title generation on a bounded background executor. Returns a Future or nil."
  [conversation-id profile-id message]
  (try
    (.submit ^ExecutorService @title-executor
             ^Callable (bound-fn* #(try
                                     (generate! conversation-id profile-id message)
                                     (catch Throwable t
                                       (log/warn t "Failed to generate Metabot conversation title"
                                                 {:conversation-id conversation-id})
                                       nil))))
    (catch RejectedExecutionException _
      (log/warn "Metabot title generation queue full; skipping title generation"
                {:conversation-id conversation-id
                 :queue-capacity  executor-queue-capacity})
      nil)))

(defn await!
  "Wait for a submitted title job. Returns nil on failure or timeout."
  [^Future title-future conversation-id]
  (when title-future
    (try
      (.get title-future (long title-timeout-ms) TimeUnit/MILLISECONDS)
      (catch TimeoutException _
        (.cancel title-future true)
        (log/warn "Metabot title generation timed out; closing stream without title"
                  {:conversation-id conversation-id
                   :timeout-ms      title-timeout-ms})
        nil)
      (catch ExecutionException e
        (log/warn (.getCause e) "Metabot title generation failed"
                  {:conversation-id conversation-id})
        nil)
      (catch InterruptedException _
        (.interrupt (Thread/currentThread))
        nil))))
