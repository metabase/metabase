(ns metabase-enterprise.monitor-relay.cycle-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase-enterprise.monitor-relay.config :as relay.config]
   [metabase-enterprise.monitor-relay.cycle :as relay.cycle]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.source :as relay.source]
   [metabase-enterprise.monitor-relay.state :as relay.state]
   [metabase.config.core :as config]
   [metabase.test :as mt])
  (:import
   (java.net ConnectException)
   (java.net.http HttpTimeoutException)))

(set! *warn-on-reflection* true)

(deftest ^:parallel backoff-ms-test
  (is (= [10000 20000 40000 60000 60000] (map relay.cycle/backoff-ms [1 2 3 4 20]))))

(deftest ^:parallel classify-test
  (let [classify #(select-keys (#'relay.cycle/classify "http://m" %) [:outcome :message])]
    (testing "a 409 is stale: the receiver has moved on, and the run skips that stream or kind"
      (is (= {:outcome :stale
              :message (str "Metabase Monitor at http://m answered 409 to rows/login: the login stream has no history"
                            " floor yet: call /sync. The relay skips it in this run.")}
             (classify {:status 409, :endpoint "rows/login"
                        :body   {:error "the login stream has no history floor yet: call /sync"}}))))
    (testing "a 401 or a 403 is a refusal"
      (is (= {:outcome :refused
              :message (str "Metabase Monitor at http://m refused the relay's token. The relay tries again in 5"
                            " minutes, or when its URL changes.")}
             (classify {:status 401, :endpoint "sync", :body {:error "unknown token"}})))
      (is (= {:outcome :refused
              :message (str "Metabase Monitor at http://m refused this relay: relay '0.1.0' is older than 0.3.0. The"
                            " relay tries again in 5 minutes.")}
             (classify {:status 403, :endpoint "sync", :body {:error "relay '0.1.0' is older than 0.3.0"}}))))
    (testing "a 429 or a 503 is a busy receiver, which may say how long to wait, up to 5 minutes"
      (is (= {:outcome :busy
              :message "Metabase Monitor at http://m answered 429 to sync. The relay tries again in 30 seconds."}
             (classify {:status 429, :endpoint "sync", :retry-after 30})))
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
                            " refused. It tries again.")}
             (classify {:error (ConnectException. "Connection refused"), :endpoint "sync"})))
      (is (= {:outcome :failed
              :message "The relay could not read the app DB: ExceptionInfo: relation does not exist. It tries again."}
             (classify {:error (ex-info "relation does not exist" {})}))))))

(deftest ^:parallel after-failure-test
  (let [now 1000]
    (testing "a refusal pauses the relay for 5 minutes"
      (is (= {:failures 1, :paused-until 301000}
             (relay.cycle/after-failure {} {:outcome :refused} now))))
    (testing "a busy receiver sets the wait, up to 5 minutes"
      (is (= {:backoff-until 31000}
             (relay.cycle/after-failure {} {:outcome :busy, :retry-after 30} now)))
      (is (= {:backoff-until 301000}
             (relay.cycle/after-failure {} {:outcome :busy, :retry-after 86400} now))))
    (testing "anything else backs off: a failure, a busy receiver with no Retry-After"
      (is (= [11000 21000 41000 61000 61000]
             (->> (iterate #(relay.cycle/after-failure % {:outcome :failed} now) {})
                  rest
                  (take 5)
                  (map :backoff-until))))
      (is (= {:failures 1, :backoff-until 11000}
             (relay.cycle/after-failure {} {:outcome :busy} now)
             (relay.cycle/after-failure {} {:outcome :failed} now))))))

(deftest ^:parallel clock-test
  (testing "the relay times its cycles and pauses on a monotonic clock: a step of the wall clock does not stall it"
    (let [before (quot (System/nanoTime) 1000000)
          now    (#'relay.cycle/now-ms)]
      (is (<= before now (quot (System/nanoTime) 1000000))))))

(def ^:private ok-target {:status :ok, :base "http://monitor:8080", :token "tok"})

(def ^:private all-streams
  {:login     {:have_through 0, :next_from 0, :gaps []}
   :execution {:have_through 4, :next_from 7, :gaps [[5 6]]}
   :view      {:have_through 0, :next_from 0, :gaps []}
   :audit     {:have_through 0, :next_from 0, :gaps []}})

(defn- sync-answer [& {:as more}]
  {:status 200
   :body   (merge {:page_rows   100
                   :streams     all-streams
                   :state       {}}
                  more)})

(defn- one-page [_stream cursor gaps?]
  {:rows      [{:event_id (inc (:next_from cursor 0))}]
   :gap_reads (if gaps? (:gaps cursor) [])
   :sequence  50
   :more?     false})

(defn- read-rows
  "The rows of state `kind` in `source`, `{kind [row …]}`, that `read` selects, as the app DB reads them."
  [source kind [read & args]]
  (let [rows (sort-by :id (get source kind))]
    (case read
      :page    (let [[from limit] args] (take limit (filter #(>= (:id %) from) rows)))
      :range   (let [[lo hi] args] (filter #(<= lo (:id %) hi) rows))
      :ids     (filter (comp (set (first args)) :id) rows)
      :changed (let [[t id limit] args]
                 (->> (sort-by (juxt :_u :id) rows)
                      (filter #(not (neg? (compare [(:_u %) (:id %)] [t id]))))
                      (take limit))))))

(def ^:private app-db-now
  "The app DB's clock in the tests, in epoch microseconds."
  100000000)

(defn- do-with-fake-receiver!
  "Calls `thunk` with the relay's clock, an atom of milliseconds, against a fake receiver whose `answer` takes the
  endpoint and the body. Returns the posts, as `[endpoint body]`, and what `thunk` returns, as `:result`."
  [{:keys [target answer page source app-db-clock log-enabled? floors clock]
    :or   {target       ok-target
           page         one-page
           app-db-clock (fn [] {:r app-db-now, :o nil, :open-transactions? true})
           log-enabled? true
           floors       (fn [_] {})}}
   thunk]
  (let [posts  (atom [])
        clock  (or clock (atom (#'relay.cycle/now-ms)))
        source (or source (atom {}))]
    (mt/with-dynamic-fn-redefs [relay.cycle/now-ms          (fn [] @clock)
                                relay.config/target         (fn [] target)
                                relay.source/sync-report    (fn [boot-id] {:boot_id boot-id, :sequences {:login 50}})
                                relay.source/log-enabled?   (fn [] log-enabled?)
                                relay.source/history-floors floors
                                relay.db/state-rows         (fn [kind read] (read-rows @source kind read))
                                relay.db/clock              app-db-clock
                                relay.source/page           (fn [stream cursor gaps? _limit] (page stream cursor gaps?))
                                relay.client/post!          (fn [_target endpoint body & _]
                                                              (swap! posts conj [endpoint body])
                                                              (answer endpoint body))]
      (let [result (thunk clock)]
        {:posts @posts, :result result}))))

(defn- run-cycles!
  "Runs `n` cycles from `state`, one every 10 s, against a fake receiver ([[do-with-fake-receiver!]]). Returns the posts
  and the final state."
  [{:keys [n state] :or {n 1} :as options}]
  (let [{:keys [posts result]} (do-with-fake-receiver!
                                options
                                (fn [clock]
                                  (reduce (fn [state _]
                                            (let [state (relay.cycle/run-cycle! state)]
                                              (swap! clock + relay.cycle/interval-ms)
                                              state))
                                          (or state (relay.cycle/initial-state))
                                          (range n))))]
    {:posts posts, :state result}))

(deftest idle-without-url-test
  (testing "without a URL the relay sends nothing, and reads its URL again each cycle"
    (doseq [target [{:status :unset} {:status :malformed}]]
      (let [{:keys [posts]} (run-cycles! {:n 3, :target target, :answer (fn [& _] (throw (ex-info "no" {})))})]
        (is (= [] posts))))))

(defn- pass-answer
  "The answer of a receiver whose mirror is empty to the state pass `step` of `body`: every bucket differs."
  [{:keys [step buckets] :as body}]
  {:status 200
   :body   (case step
             "root"    {:pass 7, :done false}
             "buckets" (if (:last body)
                         {:pass 7, :done false, :lists (for [[b] buckets] [b []])}
                         {:pass 7})
             "rows"    {:pass 7, :stored (count (:rows body)), :unchanged 0, :gone 0, :done true})})

(defn- state-answer
  "The answer of a receiver to the state post `body`: deltas move C to their `next_since`."
  [{:keys [step next_since] :as body}]
  (case step
    "delta" {:status 200, :body {:stored (count (:rows body)), :unchanged 0, :since next_since}}
    "fetch" {:status 200, :body {:stored (count (:rows body)), :unchanged 0, :gone 0}}
    (pass-answer body)))

(defn- steps
  "The `[endpoint step]` of each post, `step` nil for a post that is not a state step."
  [posts]
  (map (fn [[endpoint body]] [endpoint (:step body)]) posts))

(def ^:private tenant-rows
  [{:id 3, :tenant_id 3, :name "t3"} {:id 300, :tenant_id 300, :name "t300"}])

(def ^:private every-step
  "A `/sync` answer's `state` that asks for each kind of step."
  {:user         {:due false, :since {:t 0, :id 0}}
   :card         {:due false, :since nil}
   :group        {:due false, :fetch {:ids [1]}}
   :table        {:due false, :fetch {:above 0}}
   :tenant       {:due true}
   :no_such_kind {:due true}})

(deftest cycle-test
  (let [source                (atom {:user   [{:id 1, :user_id 1, :email "a@example.com", :_u 99000000}]
                                     :group  [{:id 1, :group_id 1, :name "g"}]
                                     :table  [{:id 2, :table_id 2, :name "t"}]
                                     :tenant tenant-rows})
        {:keys [posts state]} (run-cycles! {:source source
                                            :answer (fn [endpoint body]
                                                      (if (= "sync" endpoint)
                                                        (sync-answer :streams (dissoc all-streams :view :audit)
                                                                     :state   every-step)
                                                        (if (str/starts-with? endpoint "state/")
                                                          (state-answer body)
                                                          {:status 200, :body {}})))})
        bodies                (group-by first posts)]
    (testing "a cycle syncs, sends the deltas, the fetches, the pages of each stream, then its state passes"
      (is (= [["sync" nil]
              ["state/user" "delta"] ["state/card" "delta"]
              ["state/group" "fetch"] ["state/table" "fetch"]
              ["rows/login" nil] ["rows/execution" nil]
              ["state/tenant" "root"] ["state/tenant" "buckets"] ["state/tenant" "rows"]]
             (steps posts))))
    (testing "every state post names this node and its boot"
      (is (every? #(= (:boot-id state) (:boot_id (second %))) (rest posts)))
      (is (every? #(string? (:node_id (second %))) (rest posts))))
    (testing "a delta reads from the cursor; before the receiver has one, it sends none and sets it"
      (is (=? {:since {:t 0, :id 0}, :last true, :rows [{:id 1, :_u 99000000, :_h #"[0-9a-f]{32}"}]
               :next_since {:t (- app-db-now 5000000), :id 0}}
              (second (first (bodies "state/user")))))
      (is (= {:step "delta", :since nil, :next_since {:t (- app-db-now 5000000), :id 0}, :last true, :rows []}
             (dissoc (second (first (bodies "state/card"))) :node_id :boot_id))))
    (testing "a fetch sends the asked rows and the rows above"
      (is (=? {:ids [1], :rows [{:id 1, :name "g"}]} (second (first (bodies "state/group")))))
      (is (=? {:ids [], :rows [{:id 2}]} (second (first (bodies "state/table"))))))
    (testing "a state pass sends its root, its buckets, then the rows of the buckets that differ"
      (let [[root buckets rows] (map second (bodies "state/tenant"))]
        (is (=? {:row_count 2, :bucket_count 2, :read_ms int?} root))
        (is (=? {:pass 7, :part 0, :last true, :buckets [[0 1 string?] [1 1 string?]]} buckets))
        (is (=? {:pass 7, :buckets [0 1], :rows [{:id 3} {:id 300}], :gone []} rows))
        (is (= (:root root) (relay.state/root (:buckets buckets))))))
    (testing "a page carries its rows, the gaps it re-read and the sequence value"
      (is (= {:rows [{:event_id 8}], :gap_reads [[5 6]], :sequence 50}
             (select-keys (second (first (bodies "rows/execution"))) [:rows :gap_reads :sequence]))))
    (testing "a good cycle leaves nothing to wait for, and no state pass"
      (is (= {:last-result {:outcome :ok, :message "The run had no failure."}, :passes {}}
             (select-keys state [:last-result :failures :paused-until :backoff-until :passes]))))))

(deftest log-disabled-test
  (testing "without log-enabled?, the relay sends no views or audit events"
    (let [{:keys [posts]} (run-cycles! {:log-enabled? false
                                        :answer       (fn [endpoint _]
                                                        (if (= "sync" endpoint) (sync-answer) {:status 200}))})]
      (is (= ["sync" "rows/login" "rows/execution"] (map first posts))))))

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

(deftest deadline-test
  (testing "a cycle sends the pages of a stream for 10 s at most"
    (let [clock           (atom 0)
          {:keys [posts]} (run-cycles! {:clock  clock
                                        :page   (fn [stream cursor gaps?]
                                                  (swap! clock + 4000)
                                                  (assoc (one-page stream cursor gaps?) :more? true))
                                        :answer (fn [endpoint body]
                                                  (if (= "sync" endpoint)
                                                    (sync-answer :streams (select-keys all-streams [:login]))
                                                    (next-from-last-row endpoint body)))})]
      (is (= ["sync" "rows/login" "rows/login" "rows/login"] (map first posts)))))
  (testing "while a state pass is due, the pages stop 3 s before the deadline, and leave that time to the state passes"
    (let [clock           (atom 0)
          {:keys [posts]} (run-cycles! {:clock  clock
                                        :source (atom {:tenant tenant-rows})
                                        :page   (fn [stream cursor gaps?]
                                                  (swap! clock + 4000)
                                                  (assoc (one-page stream cursor gaps?) :more? true))
                                        :answer (fn [endpoint body]
                                                  (case endpoint
                                                    "sync"         (sync-answer
                                                                    :streams (select-keys all-streams [:login])
                                                                    :state   {:tenant {:due true}})
                                                    "state/tenant" (pass-answer body)
                                                    (next-from-last-row endpoint body)))})]
      (is (= [["sync" nil] ["rows/login" nil] ["rows/login" nil]
              ["state/tenant" "root"] ["state/tenant" "buckets"] ["state/tenant" "rows"]]
             (steps posts))))))

(def ^:private user-delta
  {:user {:due false, :since {:t 0, :id 0}}})

(deftest failure-stops-work-test
  (testing "a failed post ends the cycle's work, and the relay backs off"
    (let [{:keys [posts state]} (run-cycles! {:answer (fn [endpoint _]
                                                        (case endpoint
                                                          "sync"       (sync-answer :state user-delta)
                                                          "state/user" {:status 500}))})]
      (is (= ["sync" "state/user"] (map first posts)))
      (is (=? {:failures 1, :backoff-until int?} state))))
  (testing "a run while the relay backs off returns at once: after 1 failure it waits 10 s, after 2 it waits 20 s"
    (let [{:keys [posts state]} (run-cycles! {:n      3
                                              :answer (fn [_ _] (throw (ConnectException. "Connection refused")))})]
      (is (= ["sync" "sync"] (map first posts)))
      (is (= 2 (:failures state)))))
  (testing "an error reading the app DB backs off too"
    (let [{:keys [posts state]} (run-cycles! {:app-db-clock (fn [] (throw (ex-info "relation does not exist" {})))
                                              :answer       (fn [_ _] (sync-answer :state user-delta))})]
      (is (= ["sync"] (map first posts)))
      (is (=? {:failures 1, :backoff-until int?} state))))
  (testing "a post that keeps failing backs off, although each /sync before it succeeds"
    (let [{:keys [posts state]} (run-cycles! {:n      5
                                              :answer (fn [endpoint _]
                                                        (case endpoint
                                                          "sync"       (sync-answer :state user-delta)
                                                          "state/user" {:status 500}))})]
      (is (= 6 (count posts)))
      (is (= 3 (:failures state))))))

(defn- tenant-pass-answer
  "A receiver whose /sync answer says a `tenant` pass is due when `due?` holds, and that answers each state step with
  `step-answer`, given the clock, the step and the body."
  [clock due? step-answer]
  (fn [endpoint body]
    (case endpoint
      "sync"         (sync-answer :streams {} :state {:tenant {:due (due?)}})
      "state/tenant" (step-answer clock (:step body) body))))

(deftest pass-across-runs-test
  (testing "a pass that the deadline cuts goes on in the node's next run, from its memory"
    (let [clock                 (atom 0)
          {:keys [posts state]} (run-cycles! {:n      2
                                              :clock  clock
                                              :source (atom {:tenant tenant-rows})
                                              :answer (tenant-pass-answer clock
                                                                          (constantly false)
                                                                          (fn [clock step body]
                                                                            (when (= "root" step)
                                                                              (swap! clock + relay.cycle/interval-ms))
                                                                            (pass-answer body)))
                                              :state  {:boot-id "b"
                                                       :target  ok-target
                                                       :passes  {:tenant {:step :read, :next 0, :buckets []
                                                                          :read-ms 0}}}})]
      (testing "a pass that has not sent its root goes on only while its kind is due"
        (is (= [["sync" nil] ["sync" nil]] (steps posts)))
        (is (= {} (:passes state))))))
  (doseq [[idle-ms what buckets] [[299999 "goes on from its next chunk" [[0 1 "old"] [1 1 #"[0-9a-f]{32}"]]]
                                  [300000 "starts again from its first chunk"
                                   [[0 1 #"[0-9a-f]{32}"] [1 1 #"[0-9a-f]{32}"]]]]]
    (testing (str "a pass that has not sent its root, and of which this node read no chunk for " idle-ms " ms, " what)
      (let [{:keys [posts]} (run-cycles! {:clock  (atom 1000000)
                                          :source (atom {:tenant tenant-rows})
                                          :answer (tenant-pass-answer nil (constantly true) (fn [_ _ body]
                                                                                              (pass-answer body)))
                                          :state  {:boot-id "b"
                                                   :target  ok-target
                                                   :passes  {:tenant {:step :read, :next 256, :buckets [[0 1 "old"]]
                                                                      :read-ms 0, :read-at (- 1000000 idle-ms)}}}})]
        (is (=? {:buckets buckets} (second (nth posts 2)))))))
  (let [clock                (atom 0)
        {:keys [posts state]} (run-cycles! {:n      3
                                            :clock  clock
                                            :source (atom {:tenant tenant-rows})
                                            :answer (tenant-pass-answer clock
                                                                        (let [syncs (atom 0)] #(= 1 (swap! syncs inc)))
                                                                        (fn [clock step body]
                                                                          (when (= "root" step)
                                                                            (swap! clock + relay.cycle/interval-ms))
                                                                          (pass-answer body)))})]
    (testing "after its root, a pass goes on in the next run, though the receiver no longer says it is due"
      (is (= [["sync" nil] ["state/tenant" "root"]
              ["sync" nil] ["state/tenant" "buckets"] ["state/tenant" "rows"]
              ["sync" nil]]
             (steps posts)))
      (is (= {} (:passes state)))))
  (testing "a pass reads at most a chunk of its kind in a run"
    (with-redefs [relay.state/chunk-rows          1
                  relay.state/pass-page-rows      300]
      (let [{:keys [posts]} (run-cycles! {:n      4
                                          :source (atom {:tenant (for [id (range 1 601)]
                                                                   {:id id, :tenant_id id, :name (str "t" id)})})
                                          :answer (tenant-pass-answer nil (constantly true) (fn [_ _ body]
                                                                                              (pass-answer body)))})]
        (is (= [["sync" nil] ["sync" nil] ["sync" nil] ["state/tenant" "root"] ["state/tenant" "buckets"]
                ["state/tenant" "rows"] ["sync" nil]]
               (steps posts)))
        (is (=? {:row_count 600, :bucket_count 3} (second (nth posts 3))))))))

(deftest failed-pass-step-test
  (doseq [[what failure] [["a 409" {:status 409, :body {:error "pass 7 of tenant is not open: call /sync"}}]
                          ["a 500" {:status 500}]
                          ["a timeout" ::timeout]]
          :let [answer (fn [due?]
                         (tenant-pass-answer nil due? (fn [_ step body]
                                                        (cond
                                                          (not= "buckets" step) (pass-answer body)
                                                          (= ::timeout failure) (throw (HttpTimeoutException. "late"))
                                                          :else                 failure))))]]
    (testing (str what " at a pass step drops the pass, and no later run sends that step again")
      (let [syncs                 (atom 0)
            {:keys [posts state]} (run-cycles! {:n      3
                                                :source (atom {:tenant tenant-rows})
                                                :answer (answer #(= 1 (swap! syncs inc)))})]
        (is (= [["sync" nil] ["state/tenant" "root"] ["state/tenant" "buckets"] ["sync" nil] ["sync" nil]]
               (steps posts)))
        (is (= {} (:passes state)))))
    (testing (str "after " what " at a pass step, the run " (if (= "a 409" what) "goes on" "fails"))
      (let [{:keys [state]} (run-cycles! {:source (atom {:tenant tenant-rows})
                                          :answer (answer (constantly true))})]
        (if (= "a 409" what)
          (do (is (=? {:last-result {:outcome :ok}} state))
              (is (nil? (:failures state))))
          (is (=? {:failures 1, :last-result {:outcome :failed, :message string?}} state)))))))

(deftest pass-error-test
  (testing "an error reading the app DB in one pass fails the run, but keeps what the other passes sent in it"
    (let [syncs           (atom 0)
          {:keys [posts]} (run-cycles! {:n      2
                                        :source (atom {:group  [{:id 1, :group_id 1, :name "g"}]
                                                       :tenant ::not-rows})
                                        :state  {:boot-id "b"
                                                 :target  ok-target
                                                 :passes  {:group  {:step :buckets, :pass 7, :part 0
                                                                    :buckets [[0 1 "d"]]}
                                                           :tenant {:step :read, :next 0, :buckets [], :read-ms 0}}}
                                        :answer (fn [endpoint body]
                                                  (if (= "sync" endpoint)
                                                    (sync-answer :streams {}
                                                                 :state {:tenant {:due (= 1 (swap! syncs inc))}})
                                                    (pass-answer body)))})]
      (is (= [["sync" nil] ["state/group" "buckets"] ["state/group" "rows"] ["sync" nil]] (steps posts))))))

(deftest stale-delta-and-fetch-test
  (testing "a 409 on a delta or a fetch skips that kind; the run goes on with the other kinds and its other work"
    (let [{:keys [posts state]} (run-cycles! {:source (atom {:group [{:id 1, :group_id 1, :name "g"}]
                                                             :table [{:id 2, :table_id 2, :name "t"}]})
                                              :answer (fn [endpoint body]
                                                        (case endpoint
                                                          "sync"        (sync-answer
                                                                         :streams (select-keys all-streams [:login])
                                                                         :state {:user  {:since {:t 0, :id 0}}
                                                                                 :card  {:since {:t 0, :id 0}}
                                                                                 :group {:fetch {:ids [1]}}
                                                                                 :table {:fetch {:above 0}}})
                                                          ("state/user"
                                                           "state/group") {:status 409, :body {:error "starts at 5/0"}}
                                                          ("state/card"
                                                           "state/table") (state-answer body)
                                                          {:status 200, :body {}}))})]
      (is (= [["sync" nil] ["state/user" "delta"] ["state/card" "delta"] ["state/group" "fetch"] ["state/table" "fetch"]
              ["rows/login" nil]]
             (steps posts)))
      (is (=? {:last-result {:outcome :ok}} state))
      (is (nil? (:failures state))))))

(defn- later
  "The later of the cursors `a` and `b`."
  [a b]
  (if (pos? (compare [(:t a) (:id a)] [(:t b) (:id b)])) a b))

(deftest delta-parts-test
  (testing "each delta part sends the since of the previous answer, and reads from just after the previous part's last
            row, also when that answer's since is below that row"
    (let [cursor          (atom {:t 80000000, :id 0})
          {:keys [posts]} (run-cycles! {:source (atom {:user (for [id (range 1 6)]
                                                               {:id id, :user_id id, :_u 99000000})})
                                        :answer (fn [endpoint {:keys [next_since] :as body}]
                                                  (case endpoint
                                                    "sync"       (sync-answer :streams {}
                                                                              :page_rows 2
                                                                              :state {:user {:since @cursor}})
                                                    "state/user" (do (swap! cursor later next_since)
                                                                     {:status 200
                                                                      :body   {:stored    (count (:rows body))
                                                                               :unchanged 0
                                                                               :since     @cursor}})))})
          parts           (map second (rest posts))]
      (is (= [[1 2] [3 4] [5]] (map #(map :id (:rows %)) parts)))
      (is (= [false false true] (map :last parts)))
      (is (= [{:t 80000000, :id 0} {:t 95000000, :id 0} {:t 95000000, :id 0}] (map :since parts)))
      (is (= (repeat 3 {:t (- app-db-now 5000000), :id 0}) (map :next_since parts))))))

(deftest rows-read-in-their-run-test
  (testing "a pass's rows step reads its buckets in the run that posts them, never in an earlier run"
    (let [clock           (atom 0)
          source          (atom {:tenant tenant-rows})
          {:keys [posts]} (run-cycles! {:n      2
                                        :clock  clock
                                        :source source
                                        :answer (tenant-pass-answer clock
                                                                    (let [syncs (atom 0)] #(= 1 (swap! syncs inc)))
                                                                    (fn [clock step body]
                                                                      (when (= "buckets" step)
                                                                        (swap! clock + relay.cycle/interval-ms)
                                                                        (swap! source assoc-in [:tenant 0 :name] "new"))
                                                                      (pass-answer body)))})]
      (is (= [["sync" nil] ["state/tenant" "root"] ["state/tenant" "buckets"]
              ["sync" nil] ["state/tenant" "rows"]]
             (steps posts)))
      (is (= ["new" "t300"] (map :name (:rows (second (last posts)))))))))

(deftest refusal-pauses-test
  (let [refused (run-cycles! {:n 3, :answer (fn [_ _] {:status 401, :body {:error "unknown token"}})})]
    (testing "after a refusal the relay posts nothing for 5 minutes"
      (is (= ["sync"] (map first (:posts refused))))
      (is (some? (get-in refused [:state :paused-until]))))
    (testing "a new URL ends the pause"
      (let [{:keys [posts state]} (run-cycles! {:state  (:state refused)
                                                :target (assoc ok-target :token "new")
                                                :answer (fn [_ _] (sync-answer :streams {}))})]
        (is (= ["sync"] (map first posts)))
        (is (nil? (:paused-until state)))
        (is (nil? (:failures state)))))))

(deftest stale-page-test
  (testing "a 409 on a page skips that stream; the run goes on with the other streams and the state passes, and is not
            a failure"
    (let [{:keys [posts state]} (run-cycles! {:source (atom {:tenant tenant-rows})
                                              :answer (fn [endpoint body]
                                                        (case endpoint
                                                          "sync"         (sync-answer :state {:tenant {:due true}})
                                                          "rows/login"   {:status 409
                                                                          :body   {:error "no history floor yet"}}
                                                          "state/tenant" (pass-answer body)
                                                          {:status 200, :body {}}))})]
      (is (= [["sync" nil] ["rows/login" nil] ["rows/execution" nil] ["rows/view" nil] ["rows/audit" nil]
              ["state/tenant" "root"] ["state/tenant" "buckets"] ["state/tenant" "rows"]]
             (steps posts)))
      (is (= {:last-result {:outcome :ok, :message "The run had no failure."}}
             (select-keys state [:last-result :failures :paused-until :backoff-until]))))))

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
    (let [{:keys [posts]} (run-cycles! {:state  {:boot-id "b", :target ok-target, :history {:since "s1", :floors {}}}
                                        :target (assoc ok-target :token "new")
                                        :answer (fn [_ _] (sync-answer :streams {}))})]
      (is (nil? (:history (second (first posts))))))))

(deftest retry-after-test
  (testing "a busy receiver's Retry-After sets the wait: 42 s here, so the runs at 10, 20, 30 and 40 s return at once"
    (let [{:keys [posts]} (run-cycles! {:n 6, :answer (fn [_ _] {:status 429, :retry-after 42})})]
      (is (= ["sync" "sync"] (map first posts))))))

;;; ----------------------------------------------------- node -----------------------------------------------------

(defn- reset-node! []
  (reset! @#'relay.cycle/node nil))

(defn- node-view []
  (relay.cycle/node-status))

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
  (node-view))

(deftest node-before-first-cycle-test
  (testing "before its first cycle, a node shows only its id"
    (reset-node!)
    (is (= {:node_id      config/local-process-uuid
            :ran_here     false
            :last_run_at  nil
            :last_result  nil
            :failures     0
            :paused_until nil}
           (node-view)))))

(deftest node-test
  (let [before (t/instant)
        answer (fn [_ _] (sync-answer :streams {}))]
    (testing "a node keeps its relay's state from one run to the next, such as its boot id"
      (reset-node!)
      (let [{:keys [posts]} (do-with-fake-receiver! {:answer answer}
                                                    (fn [_]
                                                      (relay.cycle/cycle!)
                                                      (relay.cycle/cycle!)))]
        (is (= ["sync" "sync"] (map first posts)))
        (is (= [(:boot-id @@#'relay.cycle/node) (:boot-id @@#'relay.cycle/node)]
               (map (comp :boot_id second) posts)))))
    (testing "a node shows when it last ran, and its last result"
      (is (=? {:node_id      config/local-process-uuid
               :ran_here     true
               :last_run_at  #(t/<= before % (t/instant))
               :last_result  {:outcome "ok", :message "The run had no failure."}
               :failures     0
               :paused_until nil}
              (node-after! {:n 2, :answer answer}))))
    (testing "a node that ran no cycle in the last minute does not run here"
      (swap! @#'relay.cycle/node assoc :last-run-at (t/minus (t/instant) (t/seconds 61)))
      (is (false? (:ran_here (node-view)))))
    (testing "a run with no URL is a run too"
      (is (=? {:ran_here true, :last_result nil}
              (node-after! {:target {:status :unset}, :answer answer}))))))

(deftest node-after!-failure-test
  (testing "a refusal shows the receiver's reason, and the end of the pause"
    (let [before (t/instant)]
      (is (=? {:last_result  {:outcome "refused"
                              :message (str "Metabase Monitor at http://monitor:8080 refused this relay: relay"
                                            " '0.1.0' is older than 0.2.0. The relay tries again in 5 minutes.")}
               :failures     1
               :paused_until #(t/<= (t/plus before (t/seconds 299)) % (t/plus (t/instant) (t/minutes 5)))}
              (node-after! {:answer (fn [_ _] {:status 403, :body {:error "relay '0.1.0' is older than 0.2.0"}})})))))
  (testing "a paused node that runs again keeps the pause and its reason"
    (is (=? {:ran_here true, :last_result {:outcome "refused"}, :failures 1, :paused_until some?}
            (node-after! {:n 3, :answer (fn [_ _] {:status 401, :body {:error "unknown token"}})}))))
  (testing "a failed post shows its status"
    (is (=? {:last_result  {:outcome "failed"
                            :message (str "Metabase Monitor at http://monitor:8080 answered 500 to state/user. The"
                                          " relay tries again.")}
             :failures     1
             :paused_until nil}
            (node-after! {:answer (fn [endpoint _]
                                    (if (= "sync" endpoint) (sync-answer :state user-delta) {:status 500}))}))))
  (testing "a network error shows the error"
    (is (=? {:last_result {:outcome "failed"
                           :message (str "The relay could not reach Metabase Monitor at http://monitor:8080:"
                                         " ConnectException: Connection refused. It tries again.")}}
            (node-after! {:answer (fn [_ _] (throw (ConnectException. "Connection refused")))}))))
  (testing "a stream with no floor is not a failure"
    (is (=? {:last_result {:outcome "ok"}, :failures 0}
            (node-after! {:answer (fn [endpoint _]
                                    (if (= "sync" endpoint) (sync-answer) {:status 409, :body {:error "no floor"}}))})))))
