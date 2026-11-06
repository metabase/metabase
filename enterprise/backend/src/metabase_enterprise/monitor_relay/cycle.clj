(ns metabase-enterprise.monitor-relay.cycle
  "One relay cycle. The relay's Quartz job runs one every 10 s, on one node of the cluster. A cycle posts to the
  receiver, Metabase Monitor's `<base>/ingest/v1/`, in this order, and stops sending pages once 10 s have passed:

  1. `sync`: this node's ids, versions, capabilities and settings, and the highest id of each stream. Its
     `settings.change_log` says whether Metabase logs its changes (`metabase.change-log.core/enabled?`), and the
     receiver refuses a `sync` where it is false. The answer gives the receiver's cursor on each stream, such as
     `{:next_from 811, :gaps [[805 805]]}`, the state kinds to snapshot, and `history_since` while a stream has no
     floor.
  2. `rows/<stream>`: the next pages of each stream, `change` first, then `login`, `execution`, `view` and `audit`. A
     change page also carries the current rows that its entries name.
  3. `state/<kind>`: the next pages of each snapshot that the answer asks for.

  - A stream is a table that the relay reads in id order: the change log, and the facts `login_history`,
    `query_execution`, `view_log` and `audit_log`.
  - A state kind is a set of rows that the receiver keeps a copy of, such as `card` (`report_card`) or `user`
    (`core_user`). A snapshot sends all of them once, in pages of ids. After that, the change log says which rows to
    send again.
  - A gap is a range of ids that the receiver has not got, such as 805 while the transaction that took it is still
    open. The first page of a stream in each run reads its gaps again.
  - A floor is a stream's first id at or after `history_since`. The relay finds the floors once, and sends them with
    each `sync` until the answer stops asking.

  Each node keeps its relay's state in memory (`node`). The receiver keeps the delivery state, so Metabase keeps none.
  The protocol is push.md in the Metabase Monitor repository (`docs/reference/contract/push.md`)."
  (:require
   [java-time.api :as t]
   [malli.error :as me]
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase-enterprise.monitor-relay.settings :as relay.settings]
   [metabase-enterprise.monitor-relay.source :as relay.source]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase.change-log.core :as change-log]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.time Duration)))

(set! *warn-on-reflection* true)

(def interval-ms
  "How often the relay's job runs, and how long one cycle sends."
  10000)

(def ^:private default-page-rows 1000)

(def ^:private max-page-rows 10000)

(def ^:private pause-ms (* 5 60 1000))

(def ^:private max-backoff-ms (* 60 1000))

(def ^:private max-retry-after-seconds 300)

(def ^:private snapshot-share-ms
  ;; The end of a run that stream pages leave to the snapshots, so a backlog of pages does not stop them.
  3000)

(def ^:private firing-jitter-ms
  ;; How early a run may start before its wait ends, and still go ahead. A wait counts from the start of the run that
  ;; failed, and a firing can start its run late. A run that starts 0.1 s late and fails waits until 10.1 s. Without
  ;; this, a run that the next firing starts at 10 s does nothing, and the backoff takes 20 s.
  1000)

(def ^:private status-timeout (Duration/ofSeconds 5))

;; This node's relay state, in its memory only. It holds the token: never log it. Its keys:
;;
;; - `:target`: the URL the relay sends to, from [[relay.settings/target]].
;; - `:last-run-at`: when this node last ran the job, an `Instant`.
;; - `:last-result`: the last run's `{:outcome :message}` ([[classify]]). A new URL clears it.
;; - `:failures`: the failed runs in a row. A run with no failure, or a new URL, clears it.
;; - `:wait-until`: a [[now-ms]] time, monotonic, before which a run does nothing: the end of a pause or a backoff. A
;;   run with no failure, or a new URL, clears it.
;; - `:history`: the history floors that each `/sync` sends, `{:since :floors}`. An answer without `history_since`, or
;;   a new URL, clears it.
(defonce ^:private node (atom {}))

(defn- now-ms
  "Milliseconds on a monotonic clock. The relay compares its times only with each other, so a step of the wall clock
  does not stretch a wait or a pause."
  []
  (quot (System/nanoTime) 1000000))

(defonce ^:private boot-id
  ;; push.md asks for a boot id next to the node id. In Metabase both last as long as the process.
  (str (random-uuid)))

(defn- ids []
  {:node_id config/local-process-uuid, :boot_id boot-id})

;;; ------------------------------------------------- failures -----------------------------------------------------

(defn- error-text [^Throwable e]
  (str (.getSimpleName (class e)) (some->> (ex-message e) (str ": "))))

(defn- wait-seconds
  "The seconds a busy receiver's `Retry-After` makes the relay wait: at most 5 minutes."
  [retry-after]
  (min retry-after max-retry-after-seconds))

(defn- reason
  "The error that the receiver's answer `body` gives, after `: `, or an empty string."
  [body]
  (or (some->> (when (map? body) (:error body)) (str ": ")) ""))

(defn- failure-text
  "What went wrong with the failed `response` of the receiver at `base`: what it answered, or why the relay could not
  reach it. [[classify]] adds what the relay does next."
  [base {:keys [status body error endpoint]}]
  (if status
    (format "Metabase Monitor at %s answered %s to %s%s." base status endpoint (reason body))
    (format "The relay could not reach Metabase Monitor at %s: %s." base (error-text error))))

(defn- classify
  "The `:outcome` of the failed `response` of the receiver at `base`, and its `:message`: the sentence that the log
  and the status show, with what the relay does next.

  - `:refused`: a 401 or a 403. The relay pauses for 5 minutes.
  - `:busy`: a 429 or a 503. The relay waits as `Retry-After` asks, or backs off.
  - `:failed`: anything else, such as another status, a network error, or an error reading the app DB, which has no
    `:endpoint`. The relay backs off."
  [base {:keys [status body error endpoint retry-after] :as response}]
  (cond
    (= 401 status)
    {:outcome :refused
     :message (format (str "Metabase Monitor at %s refused the relay's token. The relay tries again in 5"
                           " minutes, or when its URL changes.")
                      base)}

    (= 403 status)
    {:outcome :refused
     :message (format (str "Metabase Monitor at %s refused this relay%s. The relay tries again in 5 minutes, or when"
                           " its URL changes.")
                      base (reason body))}

    (#{429 503} status)
    {:outcome :busy
     :message (str (failure-text base response)
                   (if retry-after
                     (let [seconds (wait-seconds retry-after)]
                       (format " The relay tries again in %d %s." seconds (u/format-plural seconds "second")))
                     " The relay tries again."))}

    endpoint
    {:outcome :failed
     :message (str (failure-text base response) " The relay tries again.")}

    :else
    {:outcome :failed
     :message (format "The relay could not read the application database: %s. It tries again." (error-text error))}))

(defn- backoff-ms
  "How long the relay waits after `failures` failed cycles in a row: the job's interval, doubling, up to 60 s."
  [failures]
  (min max-backoff-ms (* interval-ms (bit-shift-left 1 (min 16 (max 0 (dec failures)))))))

(defn- failed
  "The state after the failed `response`, which ends the run that started at `start`: its `:last-result`
  ([[classify]]), and a wait that counts from `start`. A busy receiver that says when to try again is not the relay's
  failure, so it does not count in `:failures`. A run of failures warns once, and a refusal at each pause; a busy
  receiver only logs at debug."
  [state {:keys [endpoint error retry-after] :as response} start]
  (let [{:keys [outcome message] :as result} (classify (get-in state [:target :base]) response)
        retry-after? (and (= :busy outcome) retry-after)
        failures     (cond-> (:failures state 0) (not retry-after?) inc)]
    (cond
      (= :refused outcome)                              (log/warn message)
      (or (= :busy outcome) (pos? (:failures state 0))) (log/debug message)
      (nil? endpoint)                                   (log/warn error message)
      :else                                             (log/warn message))
    (assoc state
           :failures    failures
           :wait-until  (+ start (cond
                                   (= :refused outcome) pause-ms
                                   retry-after?         (* 1000 (wait-seconds retry-after))
                                   :else                (backoff-ms failures)))
           :last-result result)))

(defn- recovered [state]
  (when (pos? (:failures state 0))
    (log/infof "The Metabase Monitor relay sends to %s again" (get-in state [:target :base])))
  (-> (dissoc state :failures :wait-until)
      (assoc :last-result {:outcome :ok, :message "The last run succeeded."})))

;;; --------------------------------------------------- sending ----------------------------------------------------

(defn- send!
  "Posts `body` to `endpoint` of `target`, waiting at most `timeout`, or 60 s when it is nil. Returns the response, or
  `{:error e}` for a network error or a timeout, with its `:endpoint`."
  [target endpoint body timeout]
  (assoc (try
           (relay.client/post! target endpoint body timeout)
           (catch InterruptedException e
             (throw e))
           (catch Exception e
             {:error e}))
         :endpoint endpoint))

(defn- send-stream!
  "Sends pages of `stream` from `cursor`, the receiver's `{:next_from :gaps}`, until no rows remain or `deadline`
  passes. Only the first page re-reads the gaps. A 409, which the receiver answers while the stream has no floor yet,
  skips the rest of the stream. Returns the failed response that ends the run, or nil."
  [target stream cursor page-rows deadline]
  (loop [cursor cursor, gaps? true]
    (let [{:keys [rows gap_reads more?] :as page} (relay.source/page stream cursor gaps? page-rows)]
      (when (or (seq rows) (seq gap_reads))
        (let [response (send! target (str "rows/" (name stream)) (merge (ids) (dissoc page :more?)) nil)]
          (cond
            (= 409 (:status response))        nil
            (not (relay.client/ok? response)) response
            (and more? (< (now-ms) deadline)) (recur (:body response) false)))))))

(def ^:private state-kinds
  "The state kinds, in the order the relay snapshots them."
  (sort-by name relay.sql/state-kinds))

(defn- send-snapshot!
  "Sends pages of the snapshot of state `kind` from `open`, the receiver's `{:snapshot_id :from}`, or of a new one from
  id 0, until its last page or `deadline`. A snapshot spans runs and nodes: the next `/sync` answer says where it
  stands. A 409 skips the kind: the receiver has moved on from that snapshot. Returns the failed response that ends
  the run, or nil."
  [target kind open page-rows deadline]
  (let [id (or (:snapshot_id open) (str (random-uuid)))]
    (loop [from (:from open 0)]
      (let [page     (relay.source/snapshot-page kind from page-rows)
            response (send! target (str "state/" (name kind))
                            (merge (ids) page {:step "snapshot", :snapshot_id id, :from from})
                            nil)]
        (cond
          (= 409 (:status response))                     nil
          (not (relay.client/ok? response))              response
          (and (not (:last page)) (< (now-ms) deadline)) (recur (inc (:to page))))))))

(defn- work!
  "The work of a cycle after the accepted `/sync` answer `sync`, until `deadline`: the pages of each stream it has a
  cursor for, then the snapshots of the kinds it asks for that the relay knows. While it asks for one, the pages stop
  [[snapshot-share-ms]] before `deadline`. Each stream sends its first page whatever the time, and so does the first
  kind, so that each run moves them on. Returns the failed response that ended the run, or nil."
  [target sync deadline]
  (let [page-rows (min max-page-rows (or (:page_rows sync) default-page-rows))
        kinds     (filter (set (map keyword (:snapshot sync))) state-kinds)
        pages-end (cond-> deadline (seq kinds) (- snapshot-share-ms))]
    (or (some #(when-let [cursor (get-in sync [:streams %])]
                 (send-stream! target % cursor page-rows pages-end))
              relay.sql/streams)
        (some #(when (or (= % (first kinds)) (< (now-ms) deadline))
                 (send-snapshot! target % (get-in sync [:open %]) page-rows deadline))
              kinds))))

;;; ---------------------------------------------------- cycle -----------------------------------------------------

(defn- with-history
  "The state with the history floors that the `sync` answer asks for. The receiver asks with `history_since` until it
  has the floors, and each `/sync` sends them. The floors for one `history_since` are found once."
  [state {since :history_since}]
  (cond
    (nil? since)
    (dissoc state :history)

    (= since (get-in state [:history :since]))
    state

    :else
    (let [floors (relay.source/history-floors since)]
      (log/infof "Metabase Monitor asks for the history from %s. The relay sends it from the ids %s" since floors)
      (assoc state :history {:since since, :floors floors}))))

(defn- sync! [state start]
  (let [change-log? (change-log/enabled?)
        report      (relay.source/sync-report change-log? (:history state))
        response    (send! (:target state) "sync" (merge (ids) report) nil)]
    (if-not (relay.client/ok? response)
      (failed state response start)
      ;; The failure count survives a good /sync until the work succeeds too: a page that keeps failing backs off and
      ;; warns once, instead of being sent again every cycle.
      (let [sync    (:body response)
            state   (with-history state sync)
            ;; Caught here too, so that an error reading the app DB keeps the floors this answer asked for.
            failure (try
                      (work! (:target state) sync (+ start interval-ms))
                      (catch InterruptedException e
                        (throw e))
                      (catch Exception e
                        {:error e}))]
        (if failure
          (failed state failure start)
          (recovered state))))))

(defn- retarget
  "The state for a new `target`. A new URL ends a pause and a backoff, and drops the history floors found for the old
  one and what it answered."
  [state target]
  (case (:status target)
    :ok        (log/infof "The Metabase Monitor relay sends to %s" (:base target))
    :unset     (when (:target state)
                 (log/info (str "The Metabase Monitor relay has no URL, or the license lacks the monitor-relay "
                                "feature, so the relay sends nothing")))
    :malformed (log/warn (str "The Metabase Monitor relay's URL is not of the form <base>/ingest/<token>, "
                              "so the relay sends nothing")))
  (-> state
      (assoc :target target)
      (dissoc :failures :wait-until :history :last-result)))

(defn- waiting?
  "Whether the relay waits at `now`: a refusal paused it, or it backs off. A run up to [[firing-jitter-ms]] before the
  wait ends goes ahead."
  [state now]
  (boolean (some-> (:wait-until state) (> (+ now firing-jitter-ms)))))

(defn run-cycle!
  "Runs one cycle from the relay's `state`, and returns the next state. Without a URL, or while it is paused or backs
  off, the relay only reads its URL again, and returns at once. An error reading the app DB backs off as a failed
  request does."
  [state]
  (let [start  (now-ms)
        target (relay.settings/target)
        state  (cond-> state
                 (not= target (:target state)) (retarget target))]
    (if (or (not= :ok (:status target))
            (waiting? state start))
      state
      (try
        (sync! state start)
        (catch InterruptedException e
          (throw e))
        (catch Exception e
          (failed state {:error e} start))))))

;;; ----------------------------------------------------- node -----------------------------------------------------

(defn cycle!
  "Runs one cycle on this node, from the state its last cycle left, and keeps the next state."
  []
  (reset! node (run-cycle! (swap! node assoc :last-run-at (t/instant)))))

(defn node-status
  "What the status shows of this node's relay."
  []
  (let [{:keys [last-run-at last-result failures]} @node]
    {:node_id     config/local-process-uuid
     :ran_here    (boolean (some-> last-run-at (t/after? (t/minus (t/instant) (t/minutes 1)))))
     :last_run_at last-run-at
     :last_result (some-> last-result (update :outcome name))
     :failures    (or failures 0)}))

;;; ---------------------------------------------------- status ----------------------------------------------------

(mr/def ::receiver-status
  "What Metabase Monitor answers to `POST /ingest/v1/status`, as `status`. The page shows its phase and when it last
  processed. The map is open, so the fields that this relay does not read pass through."
  [:map
   [:phase        [:enum "waiting" "loading" "sealing" "live"]]
   [:last_seal_at [:maybe :string]]])

(defn feed
  "What Metabase Monitor at `target` answers now to `POST /ingest/v1/status`: its `:status`, or why there is none,
  `:error`, and when the relay asked, `:at`. The relay waits at most 5 s. Without a URL it asks nothing."
  [target]
  (if-not (= :ok (:status target))
    {:at nil, :error nil, :status nil}
    (let [at       (t/instant)
          response (send! target "status" {} status-timeout)
          status   (get-in response [:body :status])
          error    (cond
                     (not (relay.client/ok? response))
                     (failure-text (:base target) response)

                     (nil? status)
                     "Metabase Monitor answered no status."

                     :else
                     (when-let [explanation (mr/explain ::receiver-status status)]
                       (str "Metabase Monitor answered a status of another shape: "
                            (pr-str (me/humanize explanation)))))]
      {:at at, :error error, :status (when-not error status)})))
