(ns metabase.metabot.autosave
  "Auto-save Metabot-generated ad-hoc visualizations as saved questions.

  Every `adhoc_viz` data part emitted during an interactive (in-app) agent turn is persisted as a Card in the
  requesting user's personal collection, so a chart the user liked survives the conversation and shows up in their
  normal Metabase content.

  Runs off the turn-finalization path on a background executor and is strictly best-effort: any failure (bad query,
  deleted table, …) is logged and swallowed so it can never surface to the user or fail the turn. Skipped for Slack
  turns (they carry a `channel_id`) and for callers without a personal collection (e.g. API-key users)."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.queries.core :as queries]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ArrayBlockingQueue Callable ExecutorService RejectedExecutionException ThreadFactory ThreadPoolExecutor TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private pool-size
  "Max daemon threads doing autosave work. Card creation is fast, so a small pool is plenty; threads are created on
  demand and reaped after [[idle-timeout-ms]]."
  4)

(def ^:private executor-queue-capacity
  "Max tasks allowed to queue before new submissions are rejected. The queue is normally ~empty (saves are far faster
  than turns arrive); this only kicks in under a regression/stall/abuse, where dropping a save is preferable to
  unbounded growth."
  256)

(def ^:private idle-timeout-ms
  "How long an idle thread lives before being reaped; with `allowCoreThreadTimeOut` the pool scales back to zero."
  (* 5 60 1000))

(defn- thread-pool-executor
  "Pool of up to [[pool-size]] daemon threads, created on demand, backed by a bounded queue. The default `AbortPolicy`
  throws `RejectedExecutionException` once the queue is full."
  ^ThreadPoolExecutor []
  (doto (ThreadPoolExecutor.
         (int pool-size)
         (int pool-size)
         (long idle-timeout-ms) TimeUnit/MILLISECONDS
         (ArrayBlockingQueue. (int executor-queue-capacity))
         (reify ThreadFactory
           (newThread [_ r]
             (doto (Thread. ^Runnable r)
               (.setName "metabot-autosave")
               (.setDaemon true)))))
    (.allowCoreThreadTimeOut true)))

(defonce ^:private executor (delay (thread-pool-executor)))

(defn- adhoc-viz-parts
  "The `adhoc_viz` data parts in a pre-strip `parts` vector. Each part's `:data` is the adhoc-viz value:
  `{:query <legacy-or-MBQL5 query> :link :title :display}`."
  [parts]
  (filter #(and (= :data (:type %))
                (= streaming/adhoc-viz-type (:data-type %)))
          parts))

(defn- build-card-data
  "Card attributes for one adhoc-viz `value`, saved into `collection-id`.

  `(:query value)` is the same legacy-or-MBQL-5 query that `used-tables` feeds to `lib/query`; we normalize it through
  Lib and hand the result to `create-card!`, which canonicalizes it into the Card model's stored form. The name prefers
  the chart's `:title`, then Lib's suggested name (nil for native queries), then a generic fallback."
  [collection-id value]
  (let [query (lib/query lib-be/application-database-metadata-provider (:query value))]
    {:name                   (or (not-empty (:title value))
                                 (try (lib/suggested-name query) (catch Throwable _ nil))
                                 (tru "Metabot question"))
     :dataset_query          query
     :display                (keyword (or (:display value) "table"))
     :visualization_settings {}
     :collection_id          collection-id
     :ai_generated           true}))

(defn- save-card!
  "Create one Card from an adhoc-viz `value`. Best-effort: a single bad query is logged and skipped so it never aborts
  sibling saves."
  [user-id collection-id value]
  (try
    (queries/create-card! (build-card-data collection-id value) {:id user-id})
    (catch Throwable e
      (log/warn e "Failed to auto-save a Metabot adhoc_viz as a card"))))

(defn- autosave!
  "Resolve the turn's originator + personal collection, then save every `adhoc_viz` part as a card.

  The originator lives on the *conversation* row: the web UI deliberately leaves the assistant message's `user_id`
  NULL (only slackbot stamps it). Interactive-agent only: skips Slack turns (slack markers on either row) and callers
  without a personal collection (API-key users → nil)."
  [message-id parts]
  (log/with-thread-context {:metabot_message_id message-id}
    (try
      (let [{:keys [conversation_id channel_id]}
            (t2/select-one [:model/MetabotMessage :conversation_id :channel_id] :id message-id)
            {:keys [user_id slack_channel_id]}
            (when conversation_id
              (t2/select-one [:model/MetabotConversation :user_id :slack_channel_id] :id conversation_id))
            viz-parts (adhoc-viz-parts parts)]
        (when (and user_id (nil? channel_id) (nil? slack_channel_id) (seq viz-parts))
          (when-let [coll (collection/user->personal-collection user_id)]
            (lib-be/with-metadata-provider-cache
              (doseq [part viz-parts]
                (save-card! user_id (:id coll) (:data part)))))))
      (catch Throwable e
        (log/warn e "Failed to auto-save Metabot adhoc_viz cards for message" message-id)))))

(def ^:dynamic *run-synchronously?*
  "When true, [[record-autosaved-cards!]] saves on the calling thread instead of the background executor. Bound to true
  in tests so assertions can read the created cards immediately and the work participates in the test transaction."
  false)

(defn record-autosaved-cards!
  "Save every `adhoc_viz` data part in `parts` as a Card in the turn's user's personal collection.

  Handed off to a background executor and returns immediately; callers must already have committed the message row so
  the lookup by `message-id` succeeds. When the bounded queue is full the task is dropped (logged). Binding
  [[*run-synchronously?*]] true runs the work inline (tests)."
  [message-id parts]
  (if *run-synchronously?*
    (autosave! message-id parts)
    (try
      (.submit ^ExecutorService @executor ^Callable (bound-fn* #(autosave! message-id parts)))
      (catch RejectedExecutionException _
        (log/warnf "metabot autosave queue full (capacity %d); dropping autosave for message %s"
                   executor-queue-capacity message-id)))))
