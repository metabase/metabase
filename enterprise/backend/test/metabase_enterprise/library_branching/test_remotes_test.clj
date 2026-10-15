(ns metabase-enterprise.library-branching.test-remotes-test
  "The remotes of the tests start no background gc when they receive a push. A background gc holds `gc.log.lock` in the
  remote directory, and the cleanup that removes the directory fails when the gc removes the lock first."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote       clojure.core/fn
                                 metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.push-test-util :as ptu]
   [metabase-enterprise.library-branching.repository-test-util :as rtu]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase.test.fixtures :as fixtures])
  (:import
   (java.util.concurrent AbstractExecutorService)
   (org.eclipse.jgit.internal.storage.file GC)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(defn- background-gcs
  "Calls `(f)`, and returns the count of background gcs that JGit started during the call. Each one runs at once on the
  thread that starts it."
  [f]
  (let [started  (atom 0)
        executor (proxy [AbstractExecutorService] []
                   (execute [^Runnable task]
                     (swap! started inc)
                     (.run task))
                   (shutdown [])
                   (shutdownNow [] [])
                   (isShutdown [] false)
                   (isTerminated [] false)
                   (awaitTermination [_timeout _unit] true))]
    (GC/setExecutor executor)
    (try
      (f)
      @started
      (finally
        ;; nil gives back JGit's own executor
        (GC/setExecutor nil)))))

(defn- push-a-commit!
  "Writes a commit with one file in store `s`, and pushes it to [[ptu/branch]] of its remote."
  [s]
  (let [commit (store/write-commit s [] {"a.txt" (ptu/utf8 "a")} "a commit")]
    (is (= :ok (store/cas-ref! s ptu/branch nil commit)))))

(deftest push-test-remote-starts-no-background-gc-test
  (is (zero? (background-gcs
              (fn []
                (ptu/with-remote [_repo s]
                  (push-a-commit! s)))))))

(deftest repository-test-remote-starts-no-background-gc-test
  (is (zero? (background-gcs
              (fn []
                (rtu/with-remote [_repo url]
                  (let [s (store.jgit/open-store url)]
                    (try
                      (push-a-commit! s)
                      (finally
                        (store/close s))))))))))
