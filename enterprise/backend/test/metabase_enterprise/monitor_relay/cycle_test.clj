(ns metabase-enterprise.monitor-relay.cycle-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase-enterprise.monitor-relay.cycle :as relay.cycle]
   [metabase-enterprise.monitor-relay.settings :as relay.settings]
   [metabase-enterprise.monitor-relay.source :as relay.source]
   [metabase.change-log.core :as change-log]
   [metabase.config.core :as config]
   [metabase.test :as mt])
  (:import
   (java.net ConnectException)
   (java.net.http HttpTimeoutException)))

(set! *warn-on-reflection* true)

(deftest ^:parallel backoff-ms-test
  (is (= [10000 20000 40000 60000 60000] (map #'relay.cycle/backoff-ms [1 2 3 4 20]))))

(deftest ^:parallel classify-test
  (let [classify #(#'relay.cycle/classify "http://m" %)]
    (testing "a 401 or a 403 is a refusal"
      (is (= {:outcome :refused
              :message (str "Metabase Monitor at http://m refused the relay's token. The relay tries again in 5"
                            " minutes, or when its URL changes.")}
             (classify {:status 401, :endpoint "sync", :body {:error "unknown token"}})))
      (is (= {:outcome :refused
              :message (str "Metabase Monitor at http://m refused this relay: relay '0.3.0' is older than 0.4.0. The"
                            " relay tries again in 5 minutes, or when its URL changes.")}
             (classify {:status 403, :endpoint "sync", :body {:error "relay '0.3.0' is older than 0.4.0"}}))))
    (testing "a 429 or a 503 is a busy receiver, which may say how long to wait, up to 5 minutes"
      (is (= {:outcome :busy
              :message "Metabase Monitor at http://m answered 429 to sync. The relay tries again in 30 seconds."}
             (classify {:status 429, :endpoint "sync", :retry-after 30})))
      (is (= {:outcome :busy
              :message "Metabase Monitor at http://m answered 429 to rows/view. The relay tries again in 1 second."}
             (classify {:status 429, :endpoint "rows/view", :retry-after 1})))
      (is (= {:outcome :busy
              :message "Metabase Monitor at http://m answered 503 to sync. The relay tries again in 300 seconds."}
             (classify {:status 503, :endpoint "sync", :retry-after 86400})))
      (is (= {:outcome :busy
              :message (str "Metabase Monitor at http://m answered 503 to sync: cannot check the token. The relay"
                            " tries again.")}
             (classify {:status 503, :endpoint "sync", :body {:error "cannot check the token"}}))))
    (testing "anything else fails: another status, a network error, an error reading the app DB"
      (is (= {:outcome :failed
              :message "Metabase Monitor at http://m answered 500 to state/user. The relay tries again."}
             (classify {:status 500, :endpoint "state/user", :body nil})))
      (is (= {:outcome :failed
              :message (str "The relay could not reach Metabase Monitor at http://m: ConnectException: Connection"
                            " refused. The relay tries again.")}
             (classify {:error (ConnectException. "Connection refused"), :endpoint "sync"})))
      (is (= {:outcome :failed
              :message (str "The relay could not read the application database: ExceptionInfo: relation does not exist."
                            " It tries again.")}
             (classify {:error (ex-info "relation does not exist" {})}))))))

(def ^:private ok-target {:status :ok, :base "http://monitor:8080", :token "tok"})

(def ^:private all-streams
  {:change    {:have_through 810, :next_from 810, :gaps []}
   :login     {:have_through 0, :next_from 0, :gaps []}
   :execution {:have_through 4, :next_from 7, :gaps [[5 6]]}
   :view      {:have_through 0, :next_from 0, :gaps []}
   :audit     {:have_through 0, :next_from 0, :gaps []}})

(defn- sync-answer [& {:as more}]
  {:status 200
   :body   (merge {:page_rows 100
                   :streams   all-streams
                   :snapshot  []}
                  more)})

(def ^:private change-sequence
  "The change log's sequence value in the tests."
  811)

(defn- one-page [stream cursor gaps?]
  (cond-> {:rows      [{:event_id (inc (:next_from cursor 0))}]
           :gap_reads (if gaps? (:gaps cursor) [])
           :sequence  50
           :more?     false}
    (= :change stream) (assoc :rows     [{:id 811, :table_name "tenant", :row_id 3, :action "update"}]
                              :sequence change-sequence
                              :state    {:tenant {:rows [{:id 3, :tenant_id 3, :name "t3"}], :gone []}})))

(defn- snapshot-page
  "The snapshot page of state `kind` in `source`, `{kind [row …]}`, from the id `from`, at most `limit` rows."
  [source kind from limit]
  {:pre [(sequential? (get source kind))]}
  (let [rows  (vec (take limit (filter #(>= (:id %) from) (sort-by :id (get source kind)))))
        last? (< (count rows) limit)]
    {:at change-sequence, :rows rows, :to (when-not last? (:id (peek rows))), :last last?}))

(def ^:private request-ms
  "How long each post to the fake receiver takes."
  100)

(defn- do-with-fake-receiver!
  "Calls `thunk` with the relay's clock, an atom of milliseconds, against a fake receiver whose `answer` takes the
  endpoint and the body, and which takes [[request-ms]] to answer. Metabase logs its changes, unless `change-log?`
  says otherwise, and the snapshot pages read `source` ([[snapshot-page]]). The `/sync` report carries whether
  Metabase logs its changes, and the history floors when there are some. Returns the posts, as `[endpoint body]`, and
  what `thunk` returns, as `:result`."
  [{:keys [target answer page source floors clock change-log?]
    :or   {target      ok-target
           page        one-page
           source      {}
           floors      (fn [_] {})
           change-log? (constantly true)}}
   thunk]
  (let [posts (atom [])
        clock (or clock (atom (#'relay.cycle/now-ms)))]
    (mt/with-dynamic-fn-redefs [relay.cycle/now-ms          (fn [] @clock)
                                change-log/enabled?         change-log?
                                relay.settings/target       (fn [] target)
                                relay.source/sync-report    (fn [logs? history]
                                                              (cond-> {:settings {:change_log logs?}}
                                                                history (assoc :history history)))
                                relay.source/history-floors floors
                                relay.source/page           (fn [stream cursor gaps? _limit] (page stream cursor gaps?))
                                relay.source/snapshot-page  (partial snapshot-page source)
                                relay.client/post!          (fn [_target endpoint body _timeout]
                                                              (swap! posts conj [endpoint body])
                                                              (try
                                                                (answer endpoint body)
                                                                (finally
                                                                  (swap! clock + request-ms))))]
      (let [result (thunk clock)]
        {:posts @posts, :result result}))))

(defn- run-cycles!
  "Runs `n` cycles from `state`, as Quartz fires them every 10 s, against a fake receiver ([[do-with-fake-receiver!]]):
  a cycle that runs over its 10 s starts the next one late. Returns the posts and the final state."
  [{:keys [n state] :or {n 1} :as options}]
  (let [{:keys [posts result]} (do-with-fake-receiver!
                                options
                                (fn [clock]
                                  (let [start @clock]
                                    (reduce (fn [state i]
                                              (swap! clock max (+ start (* i relay.cycle/interval-ms)))
                                              (relay.cycle/run-cycle! state))
                                            (or state {})
                                            (range n)))))]
    {:posts posts, :state result}))

(deftest idle-without-url-test
  (testing "without a URL the relay sends nothing, and reads its URL again each cycle"
    (doseq [target [{:status :unset} {:status :malformed}]]
      (let [{:keys [posts]} (run-cycles! {:n 3, :target target, :answer (fn [& _] (throw (ex-info "no" {})))})]
        (is (= [] posts))))))

(defn- snapshot-answer
  "The answer of a receiver to the snapshot page `body`."
  [body]
  {:status 200, :body {:stored (count (:rows body)), :unchanged 0}})

(def ^:private tenant-rows
  [{:id 3, :tenant_id 3, :name "t3"} {:id 300, :tenant_id 300, :name "t300"}])

(deftest cycle-test
  (let [{:keys [posts state]} (run-cycles! {:source {:tenant tenant-rows}
                                            :answer (fn [endpoint body]
                                                      (cond
                                                        (= "sync" endpoint)
                                                        (sync-answer :streams (dissoc all-streams :view :audit)
                                                                     :snapshot ["tenant" "no_such_kind"])

                                                        (str/starts-with? endpoint "state/")
                                                        (snapshot-answer body)

                                                        :else
                                                        {:status 200, :body {}}))})
        bodies                (group-by first posts)]
    (testing "a cycle syncs, sends the pages of each stream, the change log first, then the snapshots it is asked for;
              it ignores a kind it does not know"
      (is (= ["sync" "rows/change" "rows/login" "rows/execution" "state/tenant"] (map first posts))))
    (testing "every post names this node and its boot"
      (is (every? #(= {:node_id config/local-process-uuid, :boot_id @#'relay.cycle/boot-id}
                      (select-keys (second %) [:node_id :boot_id]))
                  posts)))
    (testing "a cycle posts each change page as the source reads it, with its state"
      (is (=? {:rows     [{:id 811, :table_name "tenant", :row_id 3, :action "update"}]
               :state    {:tenant {:rows [{:id 3}], :gone []}}
               :sequence change-sequence}
              (second (first (bodies "rows/change"))))))
    (testing "a fact page carries its rows, the gaps it re-read and the sequence value, and no state"
      (is (= {:rows [{:event_id 8}], :gap_reads [[5 6]], :sequence 50}
             (select-keys (second (first (bodies "rows/execution"))) [:rows :gap_reads :sequence :state]))))
    (testing "a snapshot that fits in a page sends it as its first and last page, with the change log's sequence value"
      (is (=? {:step "snapshot", :snapshot_id string?, :from 0, :to nil, :at change-sequence, :last true
               :rows [{:id 3} {:id 300}]}
              (second (first (bodies "state/tenant"))))))
    (testing "a good cycle leaves nothing to wait for"
      (is (= {:last-result {:outcome :ok, :message "The last run succeeded."}}
             (select-keys state [:last-result :failures :wait-until]))))))

(defn- next-from-last-row [_endpoint body]
  {:status 200, :body {:next_from (:event_id (last (:rows body))), :gaps []}})

(deftest more-pages-test
  (testing "while a stream has more rows, the relay sends its next page from the receiver's answer"
    (let [{:keys [posts]} (run-cycles! {:page   (fn [stream cursor gaps?]
                                                  (assoc (one-page stream cursor gaps?)
                                                         :more? (and (= :login stream) (< (:next_from cursor) 3))))
                                        :answer (fn [endpoint body]
                                                  (if (= "sync" endpoint)
                                                    (sync-answer :streams (select-keys all-streams [:login]))
                                                    (next-from-last-row endpoint body)))})]
      (is (= [nil [1] [2] [3] [4]]
             (map #(some->> % second :rows (map :event_id)) posts))))))

(defn- four-second-pages
  "A `page` that always has more rows, and takes 4 s of `clock` to read."
  [clock]
  (fn [stream cursor gaps?]
    (swap! clock + 4000)
    (assoc (one-page stream cursor gaps?) :more? true)))

(deftest deadline-test
  (testing "a cycle sends the pages of a stream for 10 s at most: each page takes 4 s, so pages start at about 0, 4 and
            8 s, and none after 10 s"
    (let [clock           (atom 0)
          {:keys [posts]} (run-cycles! {:clock  clock
                                        :page   (four-second-pages clock)
                                        :answer (fn [endpoint body]
                                                  (if (= "sync" endpoint)
                                                    (sync-answer :streams (select-keys all-streams [:login]))
                                                    (next-from-last-row endpoint body)))})]
      (is (= ["sync" "rows/login" "rows/login" "rows/login"] (map first posts)))))
  (testing "while a snapshot is asked for, the pages stop 3 s before the deadline, and leave that time to it"
    (let [clock           (atom 0)
          {:keys [posts]} (run-cycles! {:clock  clock
                                        :source {:tenant tenant-rows}
                                        :page   (four-second-pages clock)
                                        :answer (fn [endpoint body]
                                                  (case endpoint
                                                    "sync"         (sync-answer
                                                                    :streams (select-keys all-streams [:login])
                                                                    :snapshot ["tenant"])
                                                    "state/tenant" (snapshot-answer body)
                                                    (next-from-last-row endpoint body)))})]
      (is (= ["sync" "rows/login" "rows/login" "state/tenant"] (map first posts)))))
  (testing "each stream sends its first page whatever the time, and so does the first kind asked for, so that each run
            moves them on"
    (let [clock           (atom 0)
          {:keys [posts]} (run-cycles! {:clock  clock
                                        :source {:tenant tenant-rows, :user [{:id 1, :user_id 1}]}
                                        :page   (four-second-pages clock)
                                        :answer (fn [endpoint body]
                                                  (cond
                                                    (= "sync" endpoint)
                                                    (sync-answer :streams  (select-keys all-streams [:login :execution])
                                                                 :snapshot ["tenant" "user"])

                                                    (str/starts-with? endpoint "state/")
                                                    (snapshot-answer body)

                                                    :else
                                                    (next-from-last-row endpoint body)))})]
      (is (= ["sync" "rows/login" "rows/login" "rows/execution" "state/tenant"] (map first posts)))))
  (testing "a kind the relay does not know leaves the pages all of the 10 s"
    (let [clock           (atom 0)
          {:keys [posts]} (run-cycles! {:clock  clock
                                        :page   (four-second-pages clock)
                                        :answer (fn [endpoint body]
                                                  (if (= "sync" endpoint)
                                                    (sync-answer :streams  (select-keys all-streams [:login])
                                                                 :snapshot ["no_such_kind"])
                                                    (next-from-last-row endpoint body)))})]
      (is (= ["sync" "rows/login" "rows/login" "rows/login"] (map first posts))))))

(deftest failure-stops-work-test
  (testing "a failed post ends the cycle's work, and the relay backs off"
    (let [{:keys [posts state]} (run-cycles! {:answer (fn [endpoint _]
                                                        (case endpoint
                                                          "sync"        (sync-answer)
                                                          "rows/change" {:status 500}))})]
      (is (= ["sync" "rows/change"] (map first posts)))
      (is (=? {:failures 1, :wait-until int?} state))))
  (testing "the backoff counts from the start of the run that failed, and a run before it ends returns at once: the
            relay tries again 10, 20, 40 and 60 s later, after a failed answer, a network error, or a busy receiver that
            does not say when"
    (doseq [answer [(constantly {:status 500})
                    (constantly {:status 503})
                    #(throw (ConnectException. "Connection refused"))]]
      (let [clock (atom 0)
            syncs (atom [])]
        (run-cycles! {:n      14
                      :clock  clock
                      :answer (fn [_ _] (swap! syncs conj @clock) (answer))})
        (is (= [0 10000 30000 70000 130000] @syncs)))))
  (testing "an error reading the app DB backs off too"
    (let [{:keys [posts state]} (run-cycles! {:page   (fn [& _] (throw (ex-info "relation does not exist" {})))
                                              :answer (fn [_ _] (sync-answer))})]
      (is (= ["sync"] (map first posts)))
      (is (=? {:failures 1, :wait-until int?} state))))
  (testing "a post that keeps failing backs off, although each /sync before it succeeds"
    (let [clock           (atom 0)
          syncs           (atom [])
          {:keys [state]} (run-cycles! {:n      5
                                        :clock  clock
                                        :answer (fn [endpoint _]
                                                  (case endpoint
                                                    "sync"        (do (swap! syncs conj @clock) (sync-answer))
                                                    "rows/change" {:status 500}))})]
      (is (= [0 10000 30000] @syncs))
      (is (= 3 (:failures state))))))

(def ^:private many-tenants
  (for [id (range 1 6)] {:id id, :tenant_id id, :name (str "t" id)}))

(defn- tenant-receiver
  "A receiver that asks for a `tenant` snapshot, in pages of 2 rows, until one completes. It keeps the open snapshot as
  Metabase Monitor does, and its `/sync` answer says where it stands: a page from 0 opens it, a page that continues it
  moves it on, the last page completes it, and any other page gets a 409. `fail` takes each page's body, and returns
  nil to take the page, a response to answer instead, `::lost` to take the page and lose the answer, or `::restart` to
  drop the open snapshot first, as a restart of the receiver does."
  ([]
   (tenant-receiver (constantly nil)))
  ([fail]
   (let [open  (atom nil)
         done? (atom false)]
     (fn [endpoint {:keys [snapshot_id from to last] :as body}]
       (if (= "sync" endpoint)
         (sync-answer :streams   {}
                      :page_rows 2
                      :snapshot  (if @done? [] ["tenant"])
                      :open      (if @open {:tenant @open} {}))
         (let [failure (fail body)]
           (when (= ::restart failure)
             (reset! open nil))
           (cond
             (and (pos? from) (not= {:snapshot_id snapshot_id, :from from} @open))
             {:status 409
              :body   {:error (format "the tenant snapshot %s does not continue at %d: call /sync" snapshot_id from)}}

             (map? failure)
             failure

             :else
             (do (reset! open (when-not last {:snapshot_id snapshot_id, :from (inc to)}))
                 (when last
                   (reset! done? true))
                 (if (= ::lost failure)
                   (throw (HttpTimeoutException. "late"))
                   (snapshot-answer body))))))))))

(defn- snapshot-pages
  "The `[snapshot_id from]` of each snapshot page in `posts`."
  [posts]
  (keep (fn [[endpoint body]] (when (str/starts-with? endpoint "state/") ((juxt :snapshot_id :from) body))) posts))

(defn- cut-after-first-page
  "`answer`, which moves `clock` past the run's deadline when the first page of a snapshot is posted."
  [answer clock]
  (fn [endpoint body]
    (when (= 0 (:from body))
      (swap! clock + relay.cycle/interval-ms))
    (answer endpoint body)))

(deftest snapshot-pages-test
  (let [{:keys [posts]} (run-cycles! {:source {:tenant many-tenants}, :answer (tenant-receiver)})
        pages           (map second (rest posts))]
    (testing "a snapshot reads its kind in id pages: each from the id after the last page's to, the last open-ended"
      (is (= [[1 2] [3 4] [5]] (map #(map :id (:rows %)) pages)))
      (is (= [[0 2 false] [3 4 false] [5 nil true]] (map (juxt :from :to :last) pages))))
    (testing "its pages share one snapshot id"
      (is (= 1 (count (set (map :snapshot_id pages))))))))

(deftest snapshot-across-runs-test
  (testing "a snapshot that the deadline cuts goes on in the next run, with its id, from where the /sync answer's open
            says it stands"
    (let [clock            (atom 0)
          {:keys [posts]}  (run-cycles! {:n      2
                                         :clock  clock
                                         :source {:tenant many-tenants}
                                         :answer (cut-after-first-page (tenant-receiver) clock)})
          [[id] :as pages] (snapshot-pages posts)]
      (is (= ["sync" "state/tenant" "sync" "state/tenant" "state/tenant"] (map first posts)))
      (is (= [[id 0] [id 3] [id 5]] pages))))
  (testing "another node, which keeps nothing of it, goes on the same way"
    (let [clock            (atom 0)
          options          {:clock  clock
                            :source {:tenant many-tenants}
                            :answer (cut-after-first-page (tenant-receiver) clock)}
          first-node       (run-cycles! options)
          other-node       (run-cycles! options)
          [[id] :as pages] (snapshot-pages (concat (:posts first-node) (:posts other-node)))]
      (is (= [[id 0] [id 3] [id 5]] pages))))
  (testing "a kind with no open snapshot starts a new one from id 0, with a new id: here the receiver restarted"
    (let [clock               (atom 0)
          source              {:tenant many-tenants}
          before              (run-cycles! {:clock  clock
                                            :source source
                                            :answer (cut-after-first-page (tenant-receiver) clock)})
          after               (run-cycles! {:clock clock, :source source, :answer (tenant-receiver)})
          [[a] [b] :as pages] (snapshot-pages (concat (:posts before) (:posts after)))]
      (is (= [[a 0] [b 0] [b 3] [b 5]] pages))
      (is (not= a b)))))

(deftest failed-snapshot-page-test
  (doseq [[what failure from] [["a 409 (the receiver restarted)" ::restart [0 3 0 3 5]]
                               ["a 500" {:status 500} [0 3 3 5]]
                               ["a timeout after the receiver took the page" ::lost [0 3 5]]]]
    (testing (str "after " what " at a snapshot page, the next run goes on from where the /sync answer's open says")
      (let [fail?           (atom true)
            {:keys [posts]} (run-cycles! {:n      2
                                          :source {:tenant many-tenants}
                                          :answer (tenant-receiver (fn [body]
                                                                     (when (and (= 3 (:from body))
                                                                                (first (reset-vals! fail? false)))
                                                                       failure)))})]
        (is (= from (map second (snapshot-pages posts))))))))

(deftest refusal-pauses-test
  (let [refused (run-cycles! {:n 3, :answer (fn [_ _] {:status 401, :body {:error "unknown token"}})})]
    (testing "after a refusal the relay posts nothing for 5 minutes"
      (is (= ["sync"] (map first (:posts refused))))
      (is (some? (get-in refused [:state :wait-until]))))
    (testing "a new URL ends the pause, and a backoff too"
      (doseq [before [(:state refused) (:state (run-cycles! {:answer (fn [_ _] {:status 500})}))]]
        (let [{:keys [posts state]} (run-cycles! {:state  before
                                                  :target (assoc ok-target :token "new")
                                                  :answer (fn [_ _] (sync-answer :streams {}))})]
          (is (= ["sync"] (map first posts)))
          (is (nil? (:wait-until state)))
          (is (nil? (:failures state)))))))
  (testing "a refusal of a page pauses the relay too"
    (doseq [status [401 403]]
      (let [{:keys [posts state]} (run-cycles! {:n      3
                                                :answer (fn [endpoint _]
                                                          (if (= "sync" endpoint) (sync-answer) {:status status}))})]
        (is (= ["sync" "rows/change"] (map first posts)))
        (is (=? {:failures 1, :last-result {:outcome :refused}} state))))))

(deftest stale-page-test
  (testing "a 409 on a page skips that stream, or that kind's snapshot; the run goes on with the other streams and
            kinds, and is not a failure"
    (let [stale                 (fn [error] {:status 409, :body {:error error}})
          answers               {"sync"         (sync-answer :snapshot ["tenant" "user"]
                                                             :open     {:tenant {:snapshot_id "s", :from 3}})
                                 "rows/login"   (stale "the login stream has no floor yet: call /sync")
                                 "state/tenant" (stale "the tenant snapshot s does not continue at 3: call /sync")}
          {:keys [posts state]} (run-cycles! {:source {:tenant tenant-rows, :user [{:id 1, :user_id 1}]}
                                              :answer (fn [endpoint body]
                                                        (or (answers endpoint)
                                                            (if (= "state/user" endpoint)
                                                              (snapshot-answer body)
                                                              {:status 200, :body {}})))})]
      (is (= ["sync" "rows/change" "rows/login" "rows/execution" "rows/view" "rows/audit" "state/tenant" "state/user"]
             (map first posts)))
      (is (=? [["s" 3] [string? 0]] (snapshot-pages posts)))
      (is (= {:last-result {:outcome :ok, :message "The last run succeeded."}}
             (select-keys state [:last-result :failures :wait-until]))))))

(deftest history-test
  (let [asked                 (atom [])
        sync-answers          (atom [(sync-answer :history_since "s1"
                                                  :streams {:login nil, :execution (:execution all-streams)})
                                     (sync-answer :history_since "s1", :streams {})
                                     (sync-answer :history_since "s2", :streams {})
                                     (sync-answer :streams {})
                                     (sync-answer :streams {})])
        {:keys [posts state]} (run-cycles! {:n      5
                                            :floors (fn [since]
                                                      (swap! asked conj since)
                                                      {:login (count @asked)})
                                            :answer (fn [endpoint _]
                                                      (if (= "sync" endpoint)
                                                        (first (first (swap-vals! sync-answers rest)))
                                                        {:status 200, :body {:stored 1, :below_floor 1}}))})
        syncs                 (keep (fn [[endpoint body]] (when (= "sync" endpoint) body)) posts)]
    (testing "the relay sends no page of a stream without a cursor"
      (is (= ["sync" "rows/execution" "sync" "sync" "sync" "sync"] (map first posts))))
    (testing "after an answer with history_since, each /sync sends the floors, until an answer without it"
      (is (= [nil
              {:since "s1", :floors {:login 1}}
              {:since "s1", :floors {:login 1}}
              {:since "s2", :floors {:login 2}}
              nil]
             (map :history syncs)))
      (is (nil? (:history state))))
    (testing "the floors for one history_since are found once"
      (is (= ["s1" "s2"] @asked)))
    (testing "an answer's other fields, such as below_floor, change nothing"
      (is (nil? (:failures state)))))
  (testing "a new URL drops the floors found for the old one"
    (let [{:keys [posts]} (run-cycles! {:state  {:target ok-target, :history {:since "s1", :floors {}}}
                                        :target (assoc ok-target :token "new")
                                        :answer (fn [_ _] (sync-answer :streams {}))})]
      (is (nil? (:history (second (first posts)))))))
  (testing "an error reading the app DB after the answer keeps the floors it asked for: the next /sync sends them"
    (let [{:keys [posts]} (run-cycles! {:n      2
                                        :floors (constantly {:login 1})
                                        :page   (fn [& _] (throw (ex-info "relation does not exist" {})))
                                        :answer (fn [endpoint _]
                                                  (when (= "sync" endpoint)
                                                    (sync-answer :history_since "s1"
                                                                 :streams       (select-keys all-streams [:login]))))})]
      (is (= ["sync" "sync"] (map first posts)))
      (is (= [nil {:since "s1", :floors {:login 1}}] (map (comp :history second) posts))))))

(deftest retry-after-test
  (testing "a busy receiver's Retry-After sets the wait: 42 s here, so the runs at 10, 20, 30 and 40 s return at once"
    (let [{:keys [posts state]} (run-cycles! {:n 6, :answer (fn [_ _] {:status 429, :retry-after 42})})]
      (is (= ["sync" "sync"] (map first posts)))
      (testing ", and it is not a failure of the relay's"
        (is (zero? (:failures state 0))))))
  (testing "the wait is 5 minutes at most"
    (let [clock (atom 0)
          syncs (atom [])]
      (run-cycles! {:n      31
                    :clock  clock
                    :answer (fn [_ _] (swap! syncs conj @clock) {:status 503, :retry-after 86400})})
      (is (= [0 300000] @syncs)))))

;;; ----------------------------------------------------- node -----------------------------------------------------

(defn- reset-node! []
  (reset! @#'relay.cycle/node {}))

(defn- node-after!
  "This node's view after `n` runs of [[relay.cycle/cycle!]], one every 10 s, from a new node, against a fake receiver
  ([[do-with-fake-receiver!]])."
  [{:keys [n] :or {n 1} :as options}]
  (reset-node!)
  (do-with-fake-receiver! options
                          (fn [clock]
                            (dotimes [_ n]
                              (relay.cycle/cycle!)
                              (swap! clock + relay.cycle/interval-ms))))
  (relay.cycle/node-status))

(deftest node-before-first-cycle-test
  (testing "before its first cycle, a node shows only its id"
    (reset-node!)
    (is (= {:node_id     config/local-process-uuid
            :ran_here    false
            :last_run_at nil
            :last_result nil
            :failures    0}
           (relay.cycle/node-status)))))

(deftest node-test
  (let [before (t/instant)
        answer (fn [_ _] (sync-answer :streams {}))]
    (testing "a node shows when it last ran, and its last result"
      (is (=? {:node_id     config/local-process-uuid
               :ran_here    true
               :last_run_at #(t/<= before % (t/instant))
               :last_result {:outcome "ok", :message "The last run succeeded."}
               :failures    0}
              (node-after! {:n 2, :answer answer}))))
    (testing "a node that ran no cycle in the last minute does not run here"
      (swap! @#'relay.cycle/node assoc :last-run-at (t/minus (t/instant) (t/seconds 61)))
      (is (false? (:ran_here (relay.cycle/node-status)))))
    (testing "a run with no URL is a run too"
      (is (=? {:ran_here true, :last_result nil}
              (node-after! {:target {:status :unset}, :answer answer}))))))

(deftest node-failure-test
  (testing "a refusal shows the receiver's reason"
    (is (=? {:last_result {:outcome "refused"
                           :message #(str/includes? % "relay '0.3.0' is older than 0.4.0")}
             :failures    1}
            (node-after! {:answer (fn [_ _] {:status 403, :body {:error "relay '0.3.0' is older than 0.4.0"}})}))))
  (testing "a paused node that runs again keeps the refusal"
    (is (=? {:ran_here true, :last_result {:outcome "refused"}, :failures 1}
            (node-after! {:n 3, :answer (fn [_ _] {:status 401, :body {:error "unknown token"}})}))))
  (testing "a failed post shows its status"
    (is (=? {:last_result {:outcome "failed"
                           :message #(str/includes? % "answered 500 to rows/change")}
             :failures    1}
            (node-after! {:answer (fn [endpoint _]
                                    (if (= "sync" endpoint) (sync-answer) {:status 500}))}))))
  (testing "a network error shows the error"
    (is (=? {:last_result {:outcome "failed"
                           :message #(str/includes? % "ConnectException: Connection refused")}}
            (node-after! {:answer (fn [_ _] (throw (ConnectException. "Connection refused")))})))))

;;; -------------------------------------------------- change log --------------------------------------------------

(def ^:private change-log-refusal
  "What Metabase Monitor answers to a `/sync` whose `settings.change_log` is false."
  (str "settings.change_log is false: Metabase does not log its changes. It needs the change log's licence feature"
       " (change-log)"))

(defn- run-with-change-log!
  "Runs this node's relay once with the real [[change-log/enabled?]], against a receiver that refuses a `/sync` whose
  `settings.change_log` is false, as Metabase Monitor does. Returns the endpoint and `settings.change_log` of each
  post, as `:posts`, and this node's status, as `:node`."
  []
  (reset-node!)
  (let [{:keys [posts]} (do-with-fake-receiver!
                         {:change-log? (mt/original-fn #'change-log/enabled?)
                          :answer      (fn [endpoint body]
                                         (if (and (= "sync" endpoint) (false? (get-in body [:settings :change_log])))
                                           {:status 403, :body {:error change-log-refusal}}
                                           (sync-answer)))}
                         (fn [_] (relay.cycle/cycle!)))]
    {:posts (map (fn [[endpoint body]] [endpoint (get-in body [:settings :change_log])]) posts)
     :node  (relay.cycle/node-status)}))

(deftest change-log-feature-test
  (testing "with the `:change-log` feature, the /sync says that Metabase logs its changes"
    (mt/with-premium-features #{:change-log}
      (let [{:keys [posts node]} (run-with-change-log!)]
        (is (= ["sync" true] (first posts)))
        (is (=? {:last_result {:outcome "ok"}} node)))))
  (testing "without it, the relay posts only a /sync that says Metabase does not log its changes, and the receiver's
            refusal is this node's last result"
    (mt/with-premium-features #{}
      (let [{:keys [posts node]} (run-with-change-log!)]
        (is (= [["sync" false]] posts))
        (is (=? {:last_result {:outcome "refused"
                               :message #(str/includes? % change-log-refusal)}
                 :failures    1}
                node))))))
