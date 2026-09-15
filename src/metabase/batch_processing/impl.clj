(ns metabase.batch-processing.impl
  "Our wrapper for grouper -- the batch processing utility.

  Note:
  - These utilities should only be used for scenarios where data consistency is not a requirement,
    Execution is best effort and may not occur as the batched items are not persisted.
  - Suitable for use cases that can tolerate lag time in processing. For example, updating
    last_used_at of cards after a query execution. Things like recording view_log should not use
    grouper since it's important to have the data immediately available.


  Batch processing can be disabled by setting the environment variable `MB_SYNCHRONOUS_BATCH_UPDATES=true`"
  (:require
   ;; this ns is our grouper facade; the rest of the codebase goes through it
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [grouper.core :as grouper]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.settings :as batch-processing.settings]
   [metabase.parameters.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (grouper.core Grouper)))

(set! *warn-on-reflection* true)

;;; the sole purpose of this wrapper is so we can keep the original function around so we can call it directly on the
;;; current thread if we're processing stuff synchronously
(mr/def ::fn-or-var
  [:or (ms/InstanceOfClass clojure.lang.Var) fn?])

(mr/def ::grouper-wrapper
  [:map {:closed true}
   [:f       ::fn-or-var]
   [:grouper (ms/InstanceOfClass Grouper)]])

(def ^:private flush-sentinel
  "Submitted by [[flush!]] purely to get a promise that is delivered once the batch it lands in has been processed.
  Stripped out before `f` sees it."
  ::flush)

(def ^:private query-like
  [:fn (fn [q] (and (map? q) (or (contains? q :type) (contains? q :lib/type))))])

(def ^:private sdk-tracked-row
  [:map {:closed true}
   [:user_id                     {:optional true} [:maybe :int]]
   [:model                       {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id                    {:optional true} [:maybe :int]]
   [:timestamp                   {:optional true} [:maybe [:or (ms/InstanceOfClass java.time.temporal.Temporal) :keyword]]]
   [:metadata                    {:optional true} [:maybe [:map {:closed true}]]]
   [:has_access                  {:optional true} [:maybe :boolean]]
   [:hash                        {:optional true} [:maybe [:or bytes? :string]]]
   [:started_at                  {:optional true} [:maybe (ms/InstanceOfClass java.time.temporal.Temporal)]]
   [:running_time                {:optional true} [:maybe :int]]
   [:result_rows                 {:optional true} [:maybe :int]]
   [:native                      {:optional true} [:maybe :boolean]]
   [:context                     {:optional true} [:maybe [:or :keyword :string]]]
   [:error                       {:optional true} [:maybe :string]]
   [:executor_id                 {:optional true} [:maybe :int]]
   [:card_id                     {:optional true} [:maybe :int]]
   [:dashboard_id                {:optional true} [:maybe :int]]
   [:pulse_id                    {:optional true} [:maybe :int]]
   [:database_id                 {:optional true} [:maybe :int]]
   [:cache_hit                   {:optional true} [:maybe :boolean]]
   [:action_id                   {:optional true} [:maybe :int]]
   [:is_sandboxed                {:optional true} [:maybe :boolean]]
   [:cache_hash                  {:optional true} [:maybe [:or bytes? :string]]]
   [:embedding_client            {:optional true} [:maybe :string]]
   [:embedding_sdk_version       {:optional true} [:maybe :string]]
   [:parameterized               {:optional true} [:maybe :boolean]]
   [:transform_id                {:optional true} [:maybe :int]]
   [:lens_id                     {:optional true} [:maybe :string]]
   [:lens_params                 {:optional true} [:maybe [:map {:closed true} [:join_step {:optional true} [:maybe :int]]]]]
   [:auth_method                 {:optional true} [:maybe [:or :keyword :string]]]
   [:tenant_id                   {:optional true} [:maybe :int]]
   [:is_impersonated             {:optional true} [:maybe :boolean]]
   [:is_db_routed                {:optional true} [:maybe :boolean]]
   [:parameters                  {:optional true} [:maybe :string]]
   [:embedding_hostname          {:optional true} [:maybe :string]]
   [:embedding_path              {:optional true} [:maybe :string]]
   [:user_agent                  {:optional true} [:maybe :string]]
   [:ip_address                  {:optional true} [:maybe :string]]
   [:sanitized_user_agent        {:optional true} [:maybe :string]]
   [:embedding_route             {:optional true} [:maybe :string]]
   [:metabase_version            {:optional true} [:maybe :string]]
   [:embedding_client_identifier {:optional true} [:maybe :string]]
   [:start_time_millis           {:optional true} [:maybe :int]]
   [:json_query                  {:optional true} [:maybe query-like]]])

(def ^:private id+timestamp
  [:map {:closed true}
   [:id        {:optional true} [:maybe :int]]
   [:timestamp {:optional true} [:maybe (ms/InstanceOfClass java.time.temporal.Temporal)]]])

(defn- satisfies-cache-backend?
  [x]
  (satisfies? @(requiring-resolve 'metabase.query-processor.middleware.cache-backend.interface/CacheBackend) x))

(def ^:private submit-object
  [:or
   [:enum :ok :not-found :invalid-format]
   [:map {:closed true}
    [:model [:enum :model/Card :model/Dashboard :model/Table :model/Document]]
    [:id :int]]
   sdk-tracked-row
   id+timestamp
   [:map {:closed true}
    [:user-id      ms/PositiveInt]
    [:dashboard-id ms/PositiveInt]
    [:parameters   [:sequential :metabase.parameters.schema/parameter-with-value]]]
   [:map {:closed true}
    [:user-id   ms/PositiveInt]
    [:model     [:enum :model/Card :model/Table :model/Dashboard :model/Collection :model/Document]]
    [:model-id  ms/PositiveInt]
    [:context   [:enum :view :selection]]
    [:timestamp (ms/InstanceOfClass java.time.temporal.Temporal)]]
   [:fn satisfies-cache-backend?]])

(mu/defn start! :- ::grouper-wrapper
  "Wrapper around [[grouper/start!]]."
  [f :- ::fn-or-var
   & options :- [:* [:or [:enum :capacity :interval :pool]
                     :int
                     (ms/InstanceOfClass java.util.concurrent.ExecutorService)]]]
  ;; this wrapper is so we can use Vars which Grouper normally doesn't allow.
  (let [f*      (fn [items]
                  (when-let [items (not-empty (remove #{flush-sentinel} items))]
                    (f items)))
        grouper (apply grouper/start! f* options)]
    {:f f, :grouper grouper}))

(mu/defn shutdown!
  "Wrapper around [[grouper/shutdown!]]."
  [grouper :- ::grouper-wrapper]
  (grouper/shutdown! (:grouper grouper)))

(mu/defn flush!
  "Block until everything submitted to `grouper-wrapper` before this call has been processed. Batches are otherwise
  only processed once the queue fills up or the interval elapses, so callers that need to observe the effects of their
  own submissions have to flush first."
  [grouper-wrapper :- ::grouper-wrapper]
  (let [grouper (:grouper grouper-wrapper)
        ;; submit before waking the dispatcher: the sentinel is then drained in the same batch as everything already
        ;; queued, and its promise is delivered only after that whole batch has been processed.
        result  (grouper/submit! grouper flush-sentinel)]
    (.wakeUp ^Grouper grouper)
    @result
    nil))

(mu/defn submit!
  "A wrapper of [[grouper.core/submit!]] that returns nil instead of a promise.
   We use grouper for fire-and-forget scenarios, so we don't care about the result."
  [grouper-wrapper :- ::grouper-wrapper
   object :- submit-object
   & options :- [:* [:or [:enum :callback :errback] ifn?]]]
  (let [synchronous? (or (batch-processing.settings/synchronous-batch-updates)
                         ;; if we're in the middle of a transaction, we need to do this synchronously in case we roll
                         ;; back the transaction at the end (as we do in tests)
                         (mdb/in-transaction?))]
    (if synchronous?
      (let [f (:f grouper-wrapper)]
        (f [object]))
      (apply grouper/submit! (:grouper grouper-wrapper) object options))
    nil))
