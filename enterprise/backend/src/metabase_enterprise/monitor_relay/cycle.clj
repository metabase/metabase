(ns metabase-enterprise.monitor-relay.cycle
  "One relay cycle. The relay's Quartz job runs one every 10 s, on one node of the cluster. A cycle turns Metabase's
  change log on, and posts `/sync` with whether Metabase logs its changes. It never turns the log off, even when its URL
  is cleared: the log is Metabase's, and other readers may follow it (`metabase.change-log.core/turn-on!`). Then it
  sends the next pages of each stream, the change log first and logins before executions, and the next pages of the
  snapshots the receiver asks for, until 10 s have passed. The protocol is `libs/contract/PUSH.md` in the Metabase
  Monitor repository.

  Each node keeps its relay's state in memory: its boot id, its failures and pauses, its history floors and its last
  result. Metabase keeps no delivery state: each `/sync` answer says where each stream and each open snapshot stands,
  and which kinds to snapshot."
  (:require
   [java-time.api :as t]
   [malli.error :as me]
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase-enterprise.monitor-relay.config :as relay.config]
   [metabase-enterprise.monitor-relay.source :as relay.source]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase.change-log.core :as change-log]
   [metabase.config.core :as config]
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

(def ^:private status-timeout (Duration/ofSeconds 5))

(defn initial-state
  "The state of a relay before its first cycle on this node. It lives in this node's memory only, with these keys:

  - `:boot-id`: a random uuid that tells the receiver this relay's boot apart. It stays until Metabase restarts.
  - `:target`: the URL the relay sends to, from [[relay.config/target]]. It holds the token: never log it.
  - `:last-run-at`: when this node last ran the job, an `Instant`.
  - `:last-result`: the last run's `{:outcome :message}` ([[classify]]). A new URL clears it.
  - `:failures`: the failed runs in a row. A run with no failure, or a new URL, clears it.
  - `:paused-until`, `:backoff-until`: [[now-ms]] times, monotonic, before which a run does nothing. An accepted
    `/sync` clears the pause; a run with no failure, or a new URL, clears both.
  - `:history`: the history floors that each `/sync` sends, `{:since :floors}`. An answer without `history_since`, or
    a new URL, clears it."
  []
  {:boot-id (str (random-uuid))})

(defn- now-ms
  "Milliseconds on a monotonic clock. The relay compares its times only with each other, so a step of the wall clock
  does not stretch a wait or a pause."
  []
  (quot (System/nanoTime) 1000000))

(defn- ids [state]
  {:node_id config/local-process-uuid, :boot_id (:boot-id state)})

;;; ------------------------------------------------- failures -----------------------------------------------------

(defn- error-text [^Throwable e]
  (str (.getSimpleName (class e)) (some->> (ex-message e) (str ": "))))

(defn- wait-seconds
  "The seconds a busy receiver's `Retry-After` makes the relay wait: at most 5 minutes."
  [retry-after]
  (min retry-after max-retry-after-seconds))

(defn- classify
  "The failed `response` of the receiver at `base`, with its `:outcome`, and its `:message`: the sentence that the log
  and the status show, with what the relay does next.

  - `:stale`: a 409. The receiver has moved on from that stream or snapshot. The run skips it.
  - `:refused`: a 401 or a 403. The relay pauses for 5 minutes.
  - `:busy`: a 429 or a 503. The relay waits as `Retry-After` asks, or backs off.
  - `:failed`: anything else, such as another status, a network error, or an error reading the app DB, which has no
    `:endpoint`. The relay backs off."
  [base {:keys [status body error endpoint retry-after] :as response}]
  (let [reason   (or (some->> (when (map? body) (:error body)) (str ": ")) "")
        answered (format "Metabase Monitor at %s answered %s to %s%s." base status endpoint reason)]
    (merge response
           (cond
             (= 409 status)
             {:outcome :stale
              :message (str answered " The relay skips it in this run.")}

             (= 401 status)
             {:outcome :refused
              :message (format (str "Metabase Monitor at %s refused the relay's token. The relay tries again in 5"
                                    " minutes, or when its URL changes.")
                               base)}

             (= 403 status)
             {:outcome :refused
              :message (format "Metabase Monitor at %s refused this relay%s. The relay tries again in 5 minutes."
                               base reason)}

             (#{429 503} status)
             {:outcome :busy
              :message (str answered (if retry-after
                                       (format " The relay tries again in %d seconds." (wait-seconds retry-after))
                                       " The relay tries again."))}

             status
             {:outcome :failed
              :message (str answered " The relay tries again.")}

             endpoint
             {:outcome :failed
              :message (format "The relay could not reach Metabase Monitor at %s: %s. It tries again."
                               base (error-text error))}

             :else
             {:outcome :failed
              :message (format "The relay could not read the app DB: %s. It tries again." (error-text error))}))))

(defn backoff-ms
  "How long the relay waits after `failures` failed cycles in a row: the job's interval, doubling, up to 60 s."
  [failures]
  (min max-backoff-ms (* interval-ms (bit-shift-left 1 (min 16 (max 0 (dec failures)))))))

(defn after-failure
  "The relay's state after `failure`, which [[classify]] made, at `now`: a refusal pauses the relay for 5 minutes, a
  busy receiver sets the wait with `Retry-After`, and anything else backs off. A run before `:paused-until` or
  `:backoff-until` does nothing."
  [state {:keys [outcome retry-after]} now]
  (let [failures (inc (:failures state 0))]
    (cond
      (= :refused outcome)
      (assoc state :failures failures, :paused-until (+ now pause-ms))

      (and (= :busy outcome) retry-after)
      (assoc state :backoff-until (+ now (* 1000 (wait-seconds retry-after))))

      :else
      (assoc state :failures failures, :backoff-until (+ now (backoff-ms failures))))))

(defn- log-failure
  "Logs `failure`'s message. A run of failures warns once, and a refusal at each pause; a busy receiver only logs at
  debug."
  [state {:keys [outcome message error endpoint]}]
  (cond
    (= :refused outcome)                              (log/warn message)
    (or (= :busy outcome) (pos? (:failures state 0))) (log/debug message)
    (nil? endpoint)                                   (log/warn error message)
    :else                                             (log/warn message)))

(defn- failed
  "The state after `failure`, which ends the run. [[send!]] classifies a failed response; this classifies an error
  that no request met, raised reading the app DB."
  [state failure]
  (let [failure (cond->> failure
                  (not (:outcome failure)) (classify (get-in state [:target :base])))]
    (log-failure state failure)
    (assoc (after-failure state failure (now-ms)) :last-result (select-keys failure [:outcome :message]))))

(defn- recovered [state]
  (when (pos? (:failures state 0))
    (log/infof "The Metabase Monitor relay sends to %s again" (get-in state [:target :base])))
  (dissoc state :failures :paused-until :backoff-until))

;;; --------------------------------------------------- sending ----------------------------------------------------

(defn- send!
  "Posts `body` to `endpoint` of `target`, waiting at most `timeout` when one is given. Returns the response; a failed
  one, a network error or a timeout included, is [[classify]]d, with its `:endpoint`."
  ([target endpoint body]
   (send! target endpoint body nil))

  ([target endpoint body timeout]
   (let [response (try
                    (if timeout
                      (relay.client/post! target endpoint body timeout)
                      (relay.client/post! target endpoint body))
                    (catch InterruptedException e
                      (throw e))
                    (catch Exception e
                      {:error e}))]
     (if (relay.client/ok? response)
       response
       (classify (:base target) (assoc response :endpoint endpoint))))))

(defn- unless-stale
  "`failure`, or nil when it is `:stale`: a 409, the receiver has moved on from that stream or snapshot. The run then
  skips it, and goes on with the rest of its work. Logs a stale failure."
  [failure]
  (if (= :stale (:outcome failure))
    (log/debug (:message failure))
    failure))

(defn- send-stream!
  "Sends pages of `stream` from `cursor`, the receiver's `{:next_from :gaps}`, until no rows remain or `deadline`
  passes. Only the first page re-reads the gaps. Returns the failure that ends the run, or nil."
  [state stream cursor page-rows deadline]
  (loop [cursor cursor, gaps? true]
    (let [{:keys [rows gap_reads more?] :as page} (relay.source/page stream cursor gaps? page-rows)]
      (when (or (seq rows) (seq gap_reads))
        (let [response (send! (:target state) (str "rows/" (name stream)) (merge (ids state) (dissoc page :more?)))]
          (cond
            (not (relay.client/ok? response)) (unless-stale response)
            (and more? (< (now-ms) deadline))  (recur (:body response) false)))))))

(def ^:private state-kinds
  "The state kinds, in the order the relay snapshots them."
  (sort-by name relay.sql/state-kinds))

(defn- send-snapshot!
  "Sends pages of the snapshot of state `kind` from `open`, the receiver's `{:snapshot_id :from}`, or of a new one from
  id 0, until its last page or `deadline`. A snapshot spans runs and nodes: the next `/sync` answer says where it
  stands. Returns the failure that ends the run, or nil."
  [state kind open page-rows deadline]
  (let [id (or (:snapshot_id open) (str (random-uuid)))]
    (loop [from (:from open 0)]
      (when (< (now-ms) deadline)
        (let [page     (relay.source/snapshot-page kind from page-rows)
              response (send! (:target state) (str "state/" (name kind))
                              (merge (ids state) page {:step "snapshot", :snapshot_id id, :from from}))]
          (cond
            (not (relay.client/ok? response)) (unless-stale response)
            (not (:last page))                (recur (inc (:to page)))))))))

(defn- streams-to-send
  "The streams the receiver has a cursor for, in sending order. Without `log-enabled?`, Metabase writes no views or
  audit events, so the relay sends neither. The change log needs the same licence feature for now, so this matters
  only once it has a feature of its own."
  [sync]
  (let [log-enabled? (relay.source/log-enabled?)]
    (filter #(and (get-in sync [:streams %])
                  (or log-enabled? (not (#{:view :audit} %))))
            relay.sql/streams)))

(defn- work!
  "The work of a cycle after the accepted `/sync` answer `sync`, until `deadline`: the pages of each stream, then the
  snapshots. While a snapshot is asked for, the pages stop [[snapshot-share-ms]] before `deadline`. A stale stream or
  snapshot is skipped. Returns the failure that ended the run, or nil."
  [state sync deadline]
  (let [page-rows  (min max-page-rows (or (:page_rows sync) default-page-rows))
        snapshots? (seq (:snapshot sync))
        pages-end  (cond-> deadline snapshots? (- snapshot-share-ms))]
    (or (some #(send-stream! state % (get-in sync [:streams %]) page-rows pages-end)
              (streams-to-send sync))
        (some #(send-snapshot! state % (get-in sync [:open %]) page-rows deadline)
              (filter (set (map keyword (:snapshot sync))) state-kinds)))))

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

(defn- synced
  "The state after the accepted `/sync` answer `sync`."
  [state sync]
  (-> (dissoc state :paused-until)
      (assoc :last-result {:outcome :ok, :message "The run had no failure."})
      (with-history sync)))

(defn- sync! [state start]
  (let [;; before sync-report reads the change sequence, so this node's start marker is below the value it reports
        change-log? (change-log/turn-on!)
        report      (relay.source/sync-report (:boot-id state) change-log? (:history state))
        response    (send! (:target state) "sync" report)]
    (if-not (relay.client/ok? response)
      (failed state response)
      ;; The failure count survives a good /sync until the work succeeds too: a page that keeps failing backs off and
      ;; warns once, instead of being sent again every cycle.
      (let [sync  (:body response)
            state (synced state sync)]
        (if-let [failure (work! state sync (+ start interval-ms))]
          (failed state failure)
          (recovered state))))))

(defn- retarget
  "The state for a new `target`. A new URL ends a pause and a backoff, and drops the history floors found for the old
  one and what it answered."
  [state target]
  (case (:status target)
    :ok        (log/infof "The Metabase Monitor relay sends to %s" (:base target))
    :unset     (when (:target state)
                 (log/info "The Metabase Monitor relay has no URL, and sends nothing"))
    :malformed (log/warn (str "The Metabase Monitor relay's URL is not of the form <base>/ingest/<token>, "
                              "so the relay sends nothing")))
  (-> state
      (assoc :target target)
      (dissoc :failures :paused-until :backoff-until :history :last-result)))

(defn- waiting?
  "Whether the relay waits at `now`: a refusal paused it, or it backs off."
  [state now]
  (boolean (some #(some-> (% state) (> now)) [:paused-until :backoff-until])))

(defn run-cycle!
  "Runs one cycle from the relay's `state`, and returns the next state. Without a URL, or while it is paused or backs
  off, the relay only reads its URL again, and returns at once. An error reading the app DB backs off as a failed
  request does."
  [state]
  (let [start  (now-ms)
        target (relay.config/target)
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
          (failed state {:error e}))))))

;;; ----------------------------------------------------- node -----------------------------------------------------

;; This node's relay state. It holds the token: never log it.
(defonce ^:private node (atom nil))

(defn cycle!
  "Runs one cycle on this node, from the state its last cycle left, and keeps the next state."
  []
  (reset! node (run-cycle! (swap! node #(assoc (or % (initial-state)) :last-run-at (t/instant))))))

(defn node-status
  "What the status shows of this node's relay."
  []
  (let [{:keys [last-run-at paused-until last-result failures]} @node
        paused-ms (some-> paused-until (- (now-ms)))]
    {:node_id      config/local-process-uuid
     :ran_here     (boolean (some-> last-run-at (t/after? (t/minus (t/instant) (t/minutes 1)))))
     :last_run_at  last-run-at
     :last_result  (some-> last-result (update :outcome name))
     :failures     (or failures 0)
     :paused_until (when (some-> paused-ms pos?)
                     (t/plus (t/instant) (t/millis paused-ms)))}))

;;; ---------------------------------------------------- status ----------------------------------------------------

(def ReceiverStatus
  "What Metabase Monitor answers to `POST /ingest/v1/status`, as `status`: PUSH.md, \"Status\". The maps are open, so a
  field this relay does not know passes through."
  [:map
   [:phase        [:enum "waiting" "loading" "sealing" "live"]]
   [:streams      [:sequential [:map
                                [:stream   :string]
                                [:w        [:maybe :int]]
                                [:sequence [:maybe :int]]
                                [:floor    [:maybe :int]]
                                [:target   [:maybe :int]]]]]
   [:last_seal_at [:maybe :string]]
   [:nodes        [:sequential [:map
                                [:node_id      :string]
                                [:last_sync_at :string]]]]
   [:state        [:sequential [:map
                                [:kind           :string]
                                [:snapshot_age_s [:maybe :int]]]]]])

(defn feed
  "What Metabase Monitor at `target` answers now to `POST /ingest/v1/status`: its `:status`, or why there is none,
  `:error`, and when the relay asked, `:at`. The relay waits at most 5 s. Without a URL it asks nothing."
  [target]
  (if-not (= :ok (:status target))
    {:at nil, :error nil, :status nil}
    (let [at       (t/instant)
          response (send! target "status" {} status-timeout)
          status   (get-in response [:body :status])]
      (cond
        (not (relay.client/ok? response))
        {:at at, :error (:message response), :status nil}

        (nil? status)
        {:at at, :error "Metabase Monitor answered no status.", :status nil}

        (mr/validate ReceiverStatus status)
        {:at at, :error nil, :status status}

        :else
        {:at     at
         :error  (str "Metabase Monitor answered a status of another shape: "
                      (pr-str (me/humanize (mr/explain ReceiverStatus status))))
         :status nil}))))
