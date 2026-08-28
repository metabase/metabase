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
                       :created-at now :last-used-at now})

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
  (select-keys row [:id :state :created-at :last-used-at]))

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
                                                             :claimed-at nil :last-used-at (now-fn))))))
                                         dataset-id owner)]
              (if published?
                :created
                ;; The claim was stolen while this call was loading, so what it wrote has been
                ;; superseded. Reporting :created would credit it for a dataset it does not own.
                (if (= :ready (:state (get @state dataset-id))) :exists :in-progress)))
            (catch Throwable e
              (swap! state (fn [m] (cond-> m (own-claim? m dataset-id owner) (dissoc dataset-id))))
              (throw e)))))))

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
  (list-datasets [_this {:keys [id-prefix created-before last-used-before] want-state :state}]
    (into []
          (comp (map val)
                (filter (fn [row]
                          (and (or (nil? id-prefix)
                                   (.startsWith ^String (:id row) ^String id-prefix))
                               (or (nil? want-state) (= want-state (:state row)))
                               (or (nil? created-before)
                                   (.isBefore ^Instant (:created-at row) ^Instant created-before))
                               (or (nil? last-used-before)
                                   (.isBefore ^Instant (:last-used-at row) ^Instant last-used-before)))))
                (map descriptor))
          @state))

  (touch-dataset! [_this dataset-id]
    (swap! state (fn [m] (cond-> m
                           (contains? m dataset-id)
                           (update dataset-id assoc :last-used-at (now-fn)))))
    nil))

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

(deftest touch-advances-last-used-test
  (let [{:keys [store advance]} (test-world)
        s                       (store {})]
    (dataset-store/create-dataset! s "mbds_a" (dbdef "a"))
    (let [before (:last-used-at (dataset-store/describe-dataset s "mbds_a"))]
      (advance 60)
      (is (nil? (dataset-store/touch-dataset! s "mbds_a")))
      (is (.isAfter ^Instant (:last-used-at (dataset-store/describe-dataset s "mbds_a"))
                    ^Instant before)))
    (testing "touching a dataset that is not there does nothing"
      (is (nil? (dataset-store/touch-dataset! s "mbds_missing")))
      (is (nil? (dataset-store/describe-dataset s "mbds_missing"))))))

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
