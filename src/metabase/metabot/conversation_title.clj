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
    CancellationException
    Callable
    ExecutionException
    ExecutorService
    Future
    FutureTask
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

(defn- make-executor
  [thread-name]
  (doto (ThreadPoolExecutor.
         (int executor-pool-size)
         (int executor-pool-size)
         (long idle-timeout-ms) TimeUnit/MILLISECONDS
         (ArrayBlockingQueue. (int executor-queue-capacity))
         (reify ThreadFactory
           (newThread [_ r]
             (doto (Thread. r)
               (.setName thread-name)
               (.setDaemon true)))))
    (.allowCoreThreadTimeOut true)))

(defonce ^:private title-worker-executor
  (delay (make-executor "metabot-title-generator-worker")))

(defonce ^:private title-watch-executor
  (delay (make-executor "metabot-title-generator-watch")))

(defonce ^:private in-flight-title-jobs
  (atom {}))

(defn- non-blank-title
  [title]
  (when (string? title)
    (let [title (str/trim title)]
      (when-not (str/blank? title)
        title))))

(defn- current-title
  [conversation-id]
  (non-blank-title (metabot.persistence/conversation-title conversation-id)))

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
  (when (and conversation-id (not (str/blank? message)) (nil? (current-title conversation-id)))
    (let [response (metabot.self/call-llm-structured
                    (metabot.settings/llm-metabot-provider)
                    [{:role "user" :content (title-prompt message)}]
                    title-json-schema
                    nil
                    128
                    {:request-id  (str (random-uuid))
                     :session-id  conversation-id
                     :profile-id  profile-id
                     :source      "metabot_agent"
                     :tag         "conversation-title"})
          title    (clean-title (:title response))]
      (when title
        (when (pos? (long (or (metabot.persistence/set-conversation-title-if-missing! conversation-id title)
                              0)))
          title)))))

(defn- remove-in-flight-job!
  [conversation-id ^Future future]
  (swap! in-flight-title-jobs
         (fn [jobs]
           (if (= future (get jobs conversation-id))
             (dissoc jobs conversation-id)
             jobs))))

(defn- running-job
  [conversation-id]
  (when-let [future (get @in-flight-title-jobs conversation-id)]
    (if (.isDone ^Future future)
      (do
        (remove-in-flight-job! conversation-id future)
        nil)
      future)))

(defn- log-queue-full
  [conversation-id]
  (log/warn "Metabot title generation queue full; skipping title generation"
            {:conversation-id conversation-id
             :queue-capacity  executor-queue-capacity}))

(defn- generate-with-timeout!
  [conversation-id profile-id message]
  (try
    (let [worker-future (.submit ^ExecutorService @title-worker-executor
                                 ^Callable (bound-fn* #(generate! conversation-id profile-id message)))]
      (try
        (.get ^Future worker-future (long title-timeout-ms) TimeUnit/MILLISECONDS)
        (catch TimeoutException _
          (.cancel ^Future worker-future true)
          (log/warn "Metabot title generation timed out"
                    {:conversation-id conversation-id
                     :timeout-ms      title-timeout-ms})
          nil)
        (catch ExecutionException e
          (log/warn (.getCause e) "Metabot title generation failed"
                    {:conversation-id conversation-id})
          nil)
        (catch InterruptedException _
          (.interrupt (Thread/currentThread))
          nil)))
    (catch RejectedExecutionException _
      (log-queue-full conversation-id)
      nil)))

(defn ^Future submit!
  "Start title generation on a bounded background executor. Returns a Future or nil.

  Only one title job runs per conversation at a time. The returned future watches
  the real generation work and completes after the title succeeds, fails, or
  times out; the SSE stream must never block on it."
  [conversation-id profile-id message]
  (when (and conversation-id (not (str/blank? message)) (nil? (current-title conversation-id)))
    (locking in-flight-title-jobs
      (or (running-job conversation-id)
          (let [task-ref (atom nil)
                task     (FutureTask.
                          ^Callable
                          (bound-fn* #(try
                                        (generate-with-timeout! conversation-id profile-id message)
                                        (catch Throwable t
                                          (log/warn t "Failed to generate Metabot conversation title"
                                                    {:conversation-id conversation-id})
                                          nil)
                                        (finally
                                          (when-let [task @task-ref]
                                            (remove-in-flight-job! conversation-id task))))))]
            (reset! task-ref task)
            (swap! in-flight-title-jobs assoc conversation-id task)
            (try
              (.execute ^ExecutorService @title-watch-executor task)
              task
              (catch RejectedExecutionException _
                (remove-in-flight-job! conversation-id task)
                (log-queue-full conversation-id)
                nil)))))))

(defn ensure-title!
  "Ensure title generation is running when the conversation row has no title."
  [conversation-id profile-id message]
  (if-let [title (current-title conversation-id)]
    {:status :ready :title title}
    (if-let [future (or (running-job conversation-id)
                        (submit! conversation-id profile-id message))]
      {:status :pending :future future}
      {:status :missing})))

(defn title-status
  "Return the client-facing status for a conversation title."
  [conversation-id]
  (if-let [title (current-title conversation-id)]
    {:status "ready" :title title}
    {:status (if (running-job conversation-id) "pending" "missing")
     :title  nil}))

(defn- completed-future-title
  [^Future title-future conversation-id]
  (when (and title-future (.isDone title-future))
    (try
      (or (.get title-future)
          (current-title conversation-id))
      (catch ExecutionException e
        (log/warn (.getCause e) "Metabot title generation failed"
                  {:conversation-id conversation-id})
        nil)
      (catch CancellationException _
        nil)
      (catch InterruptedException _
        (.interrupt (Thread/currentThread))
        nil))))

(defn ready-title-event
  "A `data-conversation-title` SSE event when the title is already available WITHOUT a
   DB read while pending — i.e. the job is `:ready` or its future has completed.
   Returns nil while the title is still being generated."
  [title-job conversation-id]
  (when-let [title (or (:title title-job)
                       (completed-future-title (:future title-job) conversation-id))]
    {:type "data-conversation-title" :data title}))
