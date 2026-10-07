(ns metabase.collections.models.collection-placement-gate-test
  "The placement gate of the Collection hooks: a create of a Collection, or a change of its location, locks the row of
  the new parent Collection with no wait, and keeps the lock until its transaction commits.

  Not ^:parallel: the rows commit, so that the other threads of a test see them."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- on-thread
  "Run `f` on a plain Thread, with no binding of the calling thread. Returns a promise of `{:ms :result}`, or of `{:ms
  :error :status-code}`: the messages of the exception and its causes, and the first `:status-code` of their ex-data."
  [f]
  (let [p (promise)]
    (.start (Thread. ^Runnable
             (fn []
               (let [start (System/nanoTime)
                     ms    #(long (/ (- (System/nanoTime) start) 1e6))]
                 (deliver p (try
                              {:result (f) :ms (ms)}
                              (catch Throwable e
                                (let [chain (take-while some? (iterate ex-cause e))]
                                  {:ms          (ms)
                                   :error       (str/join " | " (keep ex-message chain))
                                   :status-code (some (comp :status-code ex-data) chain)}))))))))
    p))

(defn- lock-for-update!
  "Lock the row of the Collection `id` for update, as the reconcile of a merge pull and a delete do."
  [id]
  (t2/query {:select [:id] :from [:collection] :where [:= :id id] :for :update}))

(deftest gate-holds-until-the-create-commits-test
  (testing "U creates Gamma under Beta in a transaction that stays open for 1500 ms after the insert. T then locks Beta
            for update. T waits until U commits, and then T sees Gamma."
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Collection {beta :id} {:name "Beta" :location "/"}]
        (mt/with-model-cleanup [:model/Collection]
          (let [inserted (promise)
                u        (on-thread #(t2/with-transaction [_conn]
                                       (let [id (t2/insert-returning-pk! :model/Collection {:name     "Gamma"
                                                                                            :location (str "/" beta "/")})]
                                         (deliver inserted id)
                                         (Thread/sleep 1500)
                                         id)))
                gamma    (deref inserted 30000 nil)
                t        (on-thread #(t2/with-transaction [_conn]
                                       (lock-for-update! beta)
                                       (t2/select-pks-set :model/Collection :location (str "/" beta "/"))))
                {:keys [ms result]} (deref t 30000 {:error "timed out"})]
            (is (some? gamma) "U created Gamma")
            (is (= gamma (:result (deref u 30000 nil))) "the create of U commits")
            (is (>= ms 900) "T waits for the gate of U")
            (is (= #{gamma} result) "T sees Gamma")))))))

(deftest placement-under-a-locked-collection-fails-at-once-test
  (testing "T holds the row of Beta locked for update. A create of a collection under Beta, and a move of collection X
            under Beta, fail at once with a 409 error. A create at the root does not fail."
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Collection {beta :id} {:name "Beta" :location "/"}
                     :model/Collection {x :id}    {:name "X" :location "/"}]
        (mt/with-model-cleanup [:model/Collection]
          (let [held    (promise)
                release (promise)
                t       (on-thread #(t2/with-transaction [_conn]
                                      (lock-for-update! beta)
                                      (deliver held true)
                                      (deref release 30000 nil)))
                _       (deref held 30000 nil)
                create  (deref (on-thread #(t2/insert-returning-pk! :model/Collection {:name     "Gamma"
                                                                                       :location (str "/" beta "/")}))
                               10000 {:error "timed out"})
                move    (deref (on-thread #(collection/move-collection! (t2/select-one :model/Collection :id x)
                                                                        (str "/" beta "/")))
                               10000 {:error "timed out"})
                root    (deref (on-thread #(t2/insert-returning-pk! :model/Collection {:name "Root Gamma" :location "/"}))
                               10000 {:error "timed out"})]
            (deliver release true)
            (deref t 30000 nil)
            (doseq [[label r] {:create create :move move}]
              (testing label
                (is (= 409 (:status-code r)) (pr-str r))
                (is (str/includes? (str (:error r)) "The parent collection is being changed. Try again.") (pr-str r))
                (is (< (:ms r 10000) 1000) "the write fails at once")))
            (is (not (t2/exists? :model/Collection :name "Gamma")))
            (is (= "/" (t2/select-one-fn :location :model/Collection :id x)) "X stays at the root")
            (is (nil? (:error root)) (pr-str root))))))))
