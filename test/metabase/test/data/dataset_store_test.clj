(ns metabase.test.data.dataset-store-test
  "Contract tests for [[metabase.test.data.dataset-store/DatasetStore]].

  The store defined here exists only to exercise the contract; it is not test infrastructure for
  anything else. Two stores sharing one state atom stand in for two processes reaching one
  warehouse, and an injected clock makes lease expiry testable without waiting."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test.data.dataset-store :as dataset-store]
   [metabase.test.data.interface :as tx])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

;;; ---------------------------------- In-memory store ----------------------------------

(defn- expired? [{:keys [claimed-at]} ^Instant now lease-seconds]
  (boolean (and claimed-at (.isBefore ^Instant claimed-at (.minusSeconds now lease-seconds)))))

(defn- claim-for-create
  "Insert `id` claimed by `owner` if absent, or steal it if a previous claim's lease ran out. Leaves
  `state` untouched when the claim cannot be taken."
  [state id owner now lease-seconds]
  (let [row (get state id)]
    (cond
      (nil? row)
      (assoc state id {:id id :state :loading :claim-owner owner :claimed-at now
                       :created-at now})

      (and (= :loading (:state row)) (expired? row now lease-seconds))
      (update state id assoc :claim-owner owner :claimed-at now)

      :else state)))

(defn- claim-for-delete
  "Claim `id` when it is ready, or when a previous claim's lease ran out. Never inserts."
  [state id owner now lease-seconds]
  (let [row (get state id)]
    (if (and row (or (= :ready (:state row)) (expired? row now lease-seconds)))
      (update state id assoc :state :loading :claim-owner owner :claimed-at now)
      state)))

(defn- own-claim? [state id owner]
  (= owner (get-in state [id :claim-owner])))

(defn- descriptor [row]
  (select-keys row [:id :state :created-at]))

(defrecord MemoryDatasetStore [state lease-seconds now-fn owner load-fn]
  dataset-store/DatasetStore

  (create-dataset! [_this dataset-id dbdef]
    (if (= :ready (:state (get @state dataset-id)))
      :exists
      (let [[before after] (swap-vals! state claim-for-create dataset-id owner (now-fn) lease-seconds)]
        (if (identical? before after)
          (if (= :ready (:state (get @state dataset-id))) :exists :in-progress)
          (try
            (load-fn dataset-id dbdef)
            (let [published? (own-claim? (first (swap-vals!
                                                 state
                                                 (fn [m]
                                                   (cond-> m
                                                     (own-claim? m dataset-id owner)
                                                     (update dataset-id assoc :state :ready :claim-owner nil
                                                             :claimed-at nil)))))
                                         dataset-id owner)]
              (if published?
                :created
                ;; The claim was stolen while this call was loading, so what it wrote has been
                ;; superseded. Reporting :created would credit it for a dataset it does not own.
                (if (= :ready (:state (get @state dataset-id))) :exists :in-progress)))
            (catch Throwable e
              (swap! state (fn [m] (cond-> m (own-claim? m dataset-id owner) (dissoc dataset-id))))
              (throw e)))))))

  (create-temp-isolated-dataset! [_this dbdef]
    (let [dataset-id (dataset-store/temp-dataset-id dbdef)]
      ;; Always wins: the id was just minted, so nobody else can hold it.
      (swap! state claim-for-create dataset-id owner (now-fn) lease-seconds)
      (load-fn dataset-id dbdef)
      (swap! state update dataset-id assoc :state :ready :claim-owner nil :claimed-at nil)
      dataset-id))

  (delete-dataset! [_this dataset-id]
    (let [[before after] (swap-vals! state claim-for-delete dataset-id owner (now-fn) lease-seconds)]
      (cond
        (not (identical? before after)) (do (swap! state dissoc dataset-id) :deleted)
        (get @state dataset-id)         :in-progress
        :else                           :absent)))

  (describe-dataset [_this dataset-id]
    (some-> (get @state dataset-id) descriptor))

  ;; `:state` is deliberately not destructured by that name: it would shadow the record's own
  ;; `state` field, which this body derefs.
  (list-datasets [_this {:keys [id-prefix created-before] want-state :state}]
    (into []
          (comp (map val)
                (filter (fn [row]
                          (and (or (nil? id-prefix)
                                   (.startsWith ^String (:id row) ^String id-prefix))
                               (or (nil? want-state) (= want-state (:state row)))
                               (or (nil? created-before)
                                   (.isBefore ^Instant (:created-at row) ^Instant created-before)))))
                (map descriptor))
          @state)))

(defn- memory-store
  "Build a store over `state`. Distinct `:owner` values sharing one `state` model distinct processes."
  [state {:keys [lease-seconds now-fn owner load-fn]
          :or   {lease-seconds 300, owner (str (random-uuid)), load-fn (constantly nil)}}]
  (->MemoryDatasetStore state lease-seconds now-fn owner load-fn))

(defn- test-world
  "A clock, shared state, and a factory for stores over that state."
  []
  (let [clock (atom (Instant/parse "2026-01-01T00:00:00Z"))
        state (atom {})]
    {:clock   clock
     :state   state
     :advance (fn [seconds] (swap! clock #(.plusSeconds ^Instant % seconds)))
     :store   (fn [opts] (memory-store state (assoc opts :now-fn #(deref clock))))}))

(defn- dbdef [nm]
  (tx/map->DatabaseDefinition {:database-name nm :table-definitions [] :options {}}))

;;; ---------------------------------- Contract tests ----------------------------------
;;;
;;; Not `^:parallel`: every operation on this protocol is named with a `!`, which the deftest linter
;;; reads as unsafe to run concurrently. These stores touch only test-local atoms, but marking them
;;; parallel would cost either a global whitelist entry or a suppression at every call.

(deftest create-is-idempotent-test
  (let [{:keys [store]} (test-world)
        s               (store {})]
    (is (= :created (dataset-store/create-dataset! s "mbds_a" (dbdef "a"))))
    (is (= :ready (:state (dataset-store/describe-dataset s "mbds_a"))))
    (testing "a second create does no work and says so"
      (is (= :exists (dataset-store/create-dataset! s "mbds_a" (dbdef "a")))))))

(deftest concurrent-create-yields-one-created-test
  (let [{:keys [store]} (test-world)
        entered         (promise)
        release         (promise)
        a               (store {:owner "a" :load-fn (fn [_ _] (deliver entered true) @release)})
        b               (store {:owner "b"})
        loading         (future (dataset-store/create-dataset! a "mbds_a" (dbdef "a")))]
    (is (true? (deref entered 5000 false)) "loader reached the critical section")
    (testing "while a claim is held, another caller neither creates nor deletes"
      (is (= :in-progress (dataset-store/create-dataset! b "mbds_a" (dbdef "a"))))
      (is (= :in-progress (dataset-store/delete-dataset! b "mbds_a"))))
    (deliver release true)
    (is (= :created (deref loading 5000 :timeout)))
    (is (= :exists (dataset-store/create-dataset! b "mbds_a" (dbdef "a"))))))

(deftest expired-lease-is-reclaimed-test
  (let [{:keys [store advance]} (test-world)
        entered                 (promise)
        release                 (promise)
        a                       (store {:owner "a" :load-fn (fn [_ _] (deliver entered true) @release)})
        b                       (store {:owner "b"})
        loading                 (future (dataset-store/create-dataset! a "mbds_a" (dbdef "a")))]
    (is (true? (deref entered 5000 false)))
    (advance 301)
    (testing "a waiter reclaims an expired lease without judging liveness itself"
      (is (= :created (dataset-store/create-dataset! b "mbds_a" (dbdef "a")))))
    (deliver release true)
    (testing "the caller whose lease was stolen does not claim credit for the dataset"
      (is (= :exists (deref loading 5000 :timeout))))))

(deftest delete-test
  (let [{:keys [store]} (test-world)
        s               (store {})]
    (is (= :absent (dataset-store/delete-dataset! s "mbds_missing")))
    (dataset-store/create-dataset! s "mbds_a" (dbdef "a"))
    (is (= :deleted (dataset-store/delete-dataset! s "mbds_a")))
    (is (nil? (dataset-store/describe-dataset s "mbds_a")))
    (testing "deleting twice is not an error"
      (is (= :absent (dataset-store/delete-dataset! s "mbds_a"))))))

(deftest failed-load-releases-the-claim-test
  (let [{:keys [store]} (test-world)
        boom            (store {:owner "a" :load-fn (fn [_ _] (throw (ex-info "boom" {})))})
        ok              (store {:owner "b"})]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                          (dataset-store/create-dataset! boom "mbds_a" (dbdef "a"))))
    (testing "the next caller need not wait out the lease"
      (is (= :created (dataset-store/create-dataset! ok "mbds_a" (dbdef "a")))))))

(deftest list-criteria-test
  (let [{:keys [store advance clock]} (test-world)
        s                             (store {})
        ids                           #(into #{} (map :id) (dataset-store/list-datasets s %))]
    (dataset-store/create-dataset! s "mbds_a" (dbdef "a"))
    (advance 100)
    (dataset-store/create-dataset! s "other_b" (dbdef "b"))
    (testing "empty criteria match every dataset"
      (is (= #{"mbds_a" "other_b"} (ids {}))))
    (testing "id prefix"
      (is (= #{"mbds_a"} (ids {:id-prefix "mbds_"}))))
    (testing "state"
      (is (= #{"mbds_a" "other_b"} (ids {:state :ready})))
      (is (= #{} (ids {:state :loading}))))
    (testing "created-before"
      (is (= #{"mbds_a"} (ids {:created-before (.minusSeconds ^Instant @clock 50)}))))
    (testing "criteria are ANDed"
      (is (= #{} (ids {:id-prefix "mbds_" :state :loading}))))))

(deftest default-dataset-id-test
  (is (str/starts-with? (dataset-store/default-dataset-id (dbdef "venues")) dataset-store/id-prefix))
  (testing "definitions with equal content share one id"
    (is (= (dataset-store/default-dataset-id (dbdef "venues"))
           (dataset-store/default-dataset-id (dbdef "venues")))))
  (testing "definitions with differing content never do"
    (is (not= (dataset-store/default-dataset-id (dbdef "venues"))
              (dataset-store/default-dataset-id (dbdef "checkins"))))))

(deftest dataset-id-dbdef-test
  (let [original (dbdef "test-data")
        renamed  (dataset-store/dataset-id-dbdef original)]
    (testing "the definition's own name becomes its dataset id"
      (is (= (dataset-store/default-dataset-id original) (:database-name renamed)))
      (is (str/starts-with? (:database-name renamed) dataset-store/id-prefix)))
    (testing "renaming an already-renamed definition changes nothing"
      (is (= renamed (dataset-store/dataset-id-dbdef renamed))))
    (testing "table names derived from the renamed definition carry the content hash"
      ;; `db-qualified-table-name` normalizes `-` to `_`, so the table name carries the hash but is
      ;; not literally prefixed by the database name.
      (let [table-name (tx/db-qualified-table-name (:database-name renamed) "venues")]
        (is (str/starts-with? table-name (str dataset-store/id-prefix (tx/hash-dataset original))))
        (is (str/ends-with? table-name "_venues"))))
    (testing "definitions differing in content give tables differing names"
      (is (not= (tx/db-qualified-table-name
                 (:database-name (dataset-store/dataset-id-dbdef (dbdef "test-data"))) "venues")
                (tx/db-qualified-table-name
                 (:database-name (dataset-store/dataset-id-dbdef (dbdef "other-data"))) "venues"))))))

(deftest temp-database-definition-gets-the-temp-prefix-test
  (let [temp    (tx/temp-database-definition (dbdef "test-data"))
        renamed (dataset-store/dataset-id-dbdef temp)]
    (testing "a definition marked temporary is named for expiry, not for sharing"
      (is (str/starts-with? (:database-name renamed) dataset-store/temp-id-prefix)))
    (testing "still derived from the definition, so a caller holding only that can name it again"
      (is (= renamed (dataset-store/dataset-id-dbdef temp))))
    (testing "the mark is what changes the id, not the random suffix it also adds"
      (is (not= (:database-name renamed)
                (:database-name (dataset-store/dataset-id-dbdef (assoc temp :options {}))))))))

(deftest delete-dbdef-test
  (let [{:keys [store]} (test-world)
        s               (store {})
        original        (dbdef "test-data")]
    (testing "deletes the dataset a load of the same definition created"
      (is (= :created (dataset-store/create-dataset!
                       s (:database-name (dataset-store/dataset-id-dbdef original)) original)))
      (is (= :deleted (dataset-store/delete-dbdef! s original)))
      (is (nil? (dataset-store/describe-dataset
                 s (:database-name (dataset-store/dataset-id-dbdef original))))))
    (testing "a definition that was never loaded is absent, not an error"
      (is (= :absent (dataset-store/delete-dbdef! s (dbdef "never-loaded")))))
    (testing "refuses to delete a dataset another caller is still materializing"
      (let [{:keys [store]} (test-world)
            entered         (promise)
            release         (promise)
            builder         (store {:owner "builder" :load-fn (fn [_ _] (deliver entered true) @release)})
            other           (store {:owner "other"})
            dataset-id      (:database-name (dataset-store/dataset-id-dbdef original))
            build           (future (dataset-store/create-dataset! builder dataset-id original))]
        @entered
        (is (= :in-progress (dataset-store/delete-dbdef! other original)))
        (deliver release true)
        (is (= :created @build))
        (is (= :ready (:state (dataset-store/describe-dataset other dataset-id))))))))

(deftest create-dataset-and-wait-test
  (testing "waits out the caller holding the claim, then reports what it found"
    (let [{:keys [store]} (test-world)
          entered         (promise)
          release         (promise)
          a               (store {:owner "a" :load-fn (fn [_ _] (deliver entered true) @release)})
          b               (store {:owner "b"})
          loading         (future (dataset-store/create-dataset! a "mbds_a" (dbdef "a")))]
      (is (true? (deref entered 5000 false)))
      (let [waiting (future (dataset-store/create-dataset-and-wait!
                             b "mbds_a" (dbdef "a") {:timeout-ms 20000 :poll-ms 50}))]
        (deliver release true)
        (is (= :created (deref loading 5000 :timeout)))
        (is (= :exists (deref waiting 10000 :timeout))))))
  (testing "throws rather than hanging when the claim is never released"
    (let [{:keys [store]} (test-world)
          entered         (promise)
          release         (promise)
          a               (store {:owner "a" :load-fn (fn [_ _] (deliver entered true) @release)})
          b               (store {:owner "b"})]
      (future (dataset-store/create-dataset! a "mbds_a" (dbdef "a")))
      (is (true? (deref entered 5000 false)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Timed out"
                            (dataset-store/create-dataset-and-wait!
                             b "mbds_a" (dbdef "a") {:timeout-ms 300 :poll-ms 50})))
      (deliver release true))))

(deftest caching-dataset-store-test
  (testing "a dataset this process has already seen costs no further round trip"
    (let [{:keys [store]} (test-world)
          calls           (atom 0)
          counting        (reify dataset-store/DatasetStore
                            (create-dataset! [_ id dbdef]
                              (swap! calls inc)
                              (dataset-store/create-dataset! (store {}) id dbdef))
                            (create-temp-isolated-dataset! [_ _] "mbds_isolate_x")
                            (delete-dataset! [_ _] :deleted)
                            (describe-dataset [_ _] nil)
                            (list-datasets [_ _] []))
          cached          (dataset-store/caching-dataset-store counting {})]
      (is (= :created (dataset-store/create-dataset! cached "mbds_a" (dbdef "a"))))
      (is (= :created (dataset-store/create-dataset! cached "mbds_a" (dbdef "a"))))
      (is (= 1 @calls) "the second call was answered from memory")
      (testing "a different dataset is still asked about"
        (dataset-store/create-dataset! cached "mbds_b" (dbdef "b"))
        (is (= 2 @calls)))
      (testing "deleting forgets, so a later create asks again"
        (dataset-store/delete-dataset! cached "mbds_a")
        (dataset-store/create-dataset! cached "mbds_a" (dbdef "a"))
        (is (= 3 @calls)))))
  (testing ":in-progress is never remembered -- it is by definition about to change"
    (let [calls   (atom 0)
          busy    (reify dataset-store/DatasetStore
                    (create-dataset! [_ _ _] (swap! calls inc) :in-progress)
                    (create-temp-isolated-dataset! [_ _] "mbds_isolate_x")
                    (delete-dataset! [_ _] :absent)
                    (describe-dataset [_ _] nil)
                    (list-datasets [_ _] []))
          cached  (dataset-store/caching-dataset-store busy {})]
      (dotimes [_ 3] (dataset-store/create-dataset! cached "mbds_a" (dbdef "a")))
      (is (= 3 @calls)))))

(deftest temp-isolated-datasets-are-never-shared-test
  (let [{:keys [store]} (test-world)
        s               (store {})
        a               (dataset-store/create-temp-isolated-dataset! s (dbdef "test-data"))
        b               (dataset-store/create-temp-isolated-dataset! s (dbdef "test-data"))]
    (testing "two calls with identical content still give two datasets"
      (is (not= a b)))
    (testing "ids carry the temp prefix, so a sweeper can find them without touching shared ones"
      (is (str/starts-with? a dataset-store/temp-id-prefix))
      (is (str/starts-with? a dataset-store/id-prefix)))
    (testing "both are ready immediately -- there is no claim to wait on"
      (is (= :ready (:state (dataset-store/describe-dataset s a))))
      (is (= :ready (:state (dataset-store/describe-dataset s b)))))))

(deftest with-temp-dataset-deletes-on-the-way-out-test
  (let [{:keys [store]} (test-world)
        s               (store {})]
    (testing "the dataset exists inside the body and is gone after it"
      (let [seen (atom nil)]
        (dataset-store/with-temp-dataset [id [s (dbdef "test-data")]]
          (reset! seen id)
          (is (= :ready (:state (dataset-store/describe-dataset s id)))))
        (is (nil? (dataset-store/describe-dataset s @seen)))))
    (testing "and is deleted even when the body throws"
      (let [seen (atom nil)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                              (dataset-store/with-temp-dataset [id [s (dbdef "test-data")]]
                                (reset! seen id)
                                (throw (ex-info "boom" {})))))
        (is (nil? (dataset-store/describe-dataset s @seen)))))))
