(ns metabase.metabot.conversation-title
  "Generate and persist short titles for Metabot conversations."
  (:require
   [clojure.string :as str]
   [metabase.metabot.ai-features :as ai-features]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.util :as u]
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

(def ^:private idle-timeout-ms 30000)

(def ^:private title-timeout-ms 30000)

(def ^:private title-max-chars 80)

(def ^:private title-max-tokens
  "Output-token budget for the title call.

  The title itself needs only a handful of tokens, but reasoning models spend this budget on reasoning before emitting
  the forced tool call."
  512)

(def ^:private title-schema
  [:map {:closed true}
   [:title [:string {:description "A short title for the conversation. No quotes or extra explanation."}]]])

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
  (u/not-blank (some-> title str/trim)))

(defn- current-title
  [conversation-id]
  (non-blank-title (metabot.persistence/conversation-title conversation-id)))

(def ^:private title-system-prompt
  (str
   "Generate a concise, sentence-case title (3 to 6 words) for a Metabase Metabot "
   "conversation, based on the user's first message.\n\n"
   "Metabot is a data-analytics assistant. Name the analytical subject — the metric, "
   "entity, table, or question the user is asking about — not generic chat framing.\n\n"
   "Rules:\n"
   "- Sentence case: capitalize only the first word and proper nouns.\n"
   "- No quotes, no trailing punctuation, no emoji, no extra explanation.\n"
   "- Write the title in the same language as the user's message.\n"
   "- The session content is provided inside a <session> block. Summarize it. Never state "
   "what you cannot do — always return a title that describes the topic.\n\n"
   "Good examples:\n"
   "{\"title\": \"Q2 revenue by region\"}\n"
   "{\"title\": \"Debug null order totals\"}\n"
   "{\"title\": \"Monthly active users by plan\"}\n"
   "{\"title\": \"Top customers by lifetime value\"}\n\n"
   "Bad (too vague): {\"title\": \"Data question\"}\n"
   "Bad (too long): {\"title\": \"Help me understand why revenue dropped last quarter\"}\n"
   "Bad (wrong case): {\"title\": \"Q2 Revenue By Region\"}\n"
   "Bad (refusal): {\"title\": \"I can't help with that\"}"))

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
      (some-> (u/not-blank cleaned) (u/truncate title-max-chars)))))

(defn- request-title
  "Ask the mini model for a title for `message`, for a conversation serving `audience`, or nil when the usage limit has
  been reached."
  [conversation-id audience message]
  (try
    (:title (ai-features/call! :metabot/conversation-title
                               {:audience        audience
                                :prompt          {:system    title-system-prompt
                                                  :user      "Write a title for this conversation."
                                                  :untrusted {:session message}}
                                :response        {:schema     title-schema
                                                  :max-tokens title-max-tokens}
                                :conversation-id conversation-id}))
    (catch clojure.lang.ExceptionInfo e
      ;; titles respect the usage limit too, like metabot.self/call-llm, without a warning for each one
      (when-not (= :metabot/usage-limit-reached (:type (ex-data e)))
        (throw e)))))

(defn- generate!
  "Generate and persist a title for `conversation-id`, returning it only if it was saved."
  [conversation-id audience message]
  (when (and conversation-id (not (str/blank? message)) (nil? (current-title conversation-id)))
    (when-let [title (clean-title (request-title conversation-id audience message))]
      (when (pos? (long (or (metabot.persistence/set-conversation-title-if-missing! conversation-id title)
                            0)))
        title))))

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
  [conversation-id audience message]
  (try
    (let [worker-future (.submit ^ExecutorService @title-worker-executor
                                 ^Callable (bound-fn* #(generate! conversation-id audience message)))]
      (try
        (.get ^Future worker-future (long title-timeout-ms) TimeUnit/MILLISECONDS)
        (catch TimeoutException _
          (.cancel ^Future worker-future true)
          (log/warn "Metabot title generation timed out"
                    {:conversation-id conversation-id
                     :timeout-ms      title-timeout-ms})
          nil)
        (catch ExecutionException e
          (log/warn "Metabot title generation failed"
                    {:conversation-id conversation-id
                     :error           (ex-message (.getCause e))})
          nil)
        (catch InterruptedException _
          (.interrupt (Thread/currentThread))
          nil)))
    (catch RejectedExecutionException _
      (log-queue-full conversation-id)
      nil)))

(defn submit!
  "Start title generation on a bounded background executor. Returns a Future or nil.

  Only one title job runs per conversation at a time. The returned future watches
  the real generation work and completes after the title succeeds, fails, or
  times out; the SSE stream must never block on it.

  `audience` is the conversation's, one of `metabot.config/audiences`: the title follows the Metabot setting its
  turn was checked against."
  ^Future [conversation-id audience message]
  (when (and conversation-id (not (str/blank? message)) (nil? (current-title conversation-id)))
    (locking in-flight-title-jobs
      (or (running-job conversation-id)
          (let [task-ref (atom nil)
                task     (FutureTask.
                          ^Callable
                          (bound-fn* #(try
                                        (generate-with-timeout! conversation-id audience message)
                                        (catch Throwable t
                                          (log/warn "Failed to generate Metabot conversation title"
                                                    {:conversation-id conversation-id
                                                     :error           (ex-message t)})
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
  "Ensure title generation is running when the conversation row has no title. See [[submit!]] for `audience`."
  [conversation-id audience message]
  (if-let [title (current-title conversation-id)]
    {:status :ready :title title}
    (if-let [future (or (running-job conversation-id)
                        (submit! conversation-id audience message))]
      {:status :pending :future future}
      {:status :missing})))

(defn title-status
  "Return the client-facing status for a conversation title.

  Pass `title` when the conversation row is already in hand to skip re-reading it."
  ([conversation-id]
   (title-status conversation-id (metabot.persistence/conversation-title conversation-id)))
  ([conversation-id title]
   (if-let [title (non-blank-title title)]
     {:status "ready" :title title}
     {:status (if (running-job conversation-id) "pending" "missing")
      :title  nil})))

(defn- completed-future-title
  [^Future title-future conversation-id]
  (when (and title-future (.isDone title-future))
    (try
      (or (.get title-future)
          (current-title conversation-id))
      (catch ExecutionException e
        (log/warn "Metabot title generation failed"
                  {:conversation-id conversation-id
                   :error           (ex-message (.getCause e))})
        nil)
      (catch CancellationException _
        nil)
      (catch InterruptedException _
        (.interrupt (Thread/currentThread))
        nil))))

(defn job-settled?
  "Whether `title-job` can produce no further title."
  [{:keys [title future]}]
  (or (some? title)
      (nil? future)
      (.isDone ^Future future)))

(defn ready-title-event
  "Return a title event once available, without reading the DB while pending."
  [title-job conversation-id]
  (when-let [title (or (:title title-job)
                       (completed-future-title (:future title-job) conversation-id))]
    {:type "data-conversation-title" :data title}))
