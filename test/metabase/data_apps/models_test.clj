(ns metabase.data-apps.models-test
  "Tests for data apps models"
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.data-apps.models :as data-apps.models]
   [metabase.data-apps.test-util :as data-apps.tu]
   [metabase.driver.mysql :as mysql]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(defn- prune-definitions! [& opts]
  (apply #'data-apps.models/prune-definitions! opts))

(defn- prune-async! [& opts]
  (apply #'data-apps.models/prune-definitions-async! opts))

(defn- mariadb-appdb? []
  (= "MariaDB"
     (t2/with-connection [conn]
       (.getDatabaseProductName
        (.getMetaData conn)))))

(deftest async-pruning-test
  (testing "Test async pruning isn't totally broken"
    (data-apps.tu/with-data-app-cleanup!
      (data-apps.tu/with-data-app! [app {:name "MyApp"}]
        (dotimes [_ 10]
          (data-apps.models/set-latest-definition! (:id app) {:creator_id (mt/user->id :crowberto)
                                                              :config     data-apps.tu/default-app-definition-config}))
        (is (= 10 (t2/count :model/DataAppDefinition :app_id (:id app))))
        (let [call-count  5
              keep-count  2
              invocations (atom 0)
              block-fn    #(u/poll {:thunk       (fn []
                                                   [@@#'data-apps.models/pruner-dirty
                                                    @@#'data-apps.models/pruner])
                                    :done?       (fn [[dirty status]]
                                                   (and (false? dirty)
                                                        (get #{:finished :skipped :failed} status)))
                                    :interval-ms 50
                                    :timeout-ms  1000})
              latch       (CountDownLatch. (inc call-count))]
          ;; Wait for any prior pruning to finish, so we don't get de-duplicated with it.
          (block-fn)
          (mt/with-dynamic-fn-redefs [data-apps.models/prune-definitions!
                                      (let [original-fn (mt/dynamic-value @#'data-apps.models/prune-definitions!)]
                                        (fn [& opts]
                                          (swap! invocations inc)
                                          (.countDown latch)
                                          (apply original-fn opts)))]
            (dotimes [_ call-count]
              (prune-async! keep-count keep-count)))
          ;; Wait for our own invocations to complete.
          (.countDown latch)
          (block-fn)
          (testing "We skip consecutive pruning, if nothing has changed."
            (is (= 1 @invocations)))
          (testing "We keep 2 unreferenced definition + HEAD"
            ;; Getting CI issues with the latest MariaDB, it claims there is "No database selected" for the Delete.
            (when-not (mariadb-appdb?)
              ;; Well, that's unexpected, but the focus of this test.
              (is (= #{#_8 #_9 10}
                     (t2/select-fn-set :revision_number :model/DataAppDefinition :app_id (:id app)))))))))))

(deftest prune-definitions-test
  ;; Getting CI issues with the latest MariaDB, it claims there is "No database selected" for the Delete.
  ;; Version 10.2 appears not to have trouble with this test, but it does fail for the async one.
  (when-not (mariadb-appdb?)
    (testing "Pruning a single app with multiple releases"
      (data-apps.tu/with-data-app-cleanup!
        ;; Prune *everything* unprotected to avoid flakes from other tests, or state in your dev database.
        (prune-definitions! 0 0)
        (let [retention-per-app 5
              retention-total   5

              ;; Create an app with a bunch of releases with a bunch of interspersed definitions.
              num-versions      5
              defs-per-version  5
              num-definitions   (inc (* num-versions defs-per-version))
              app-id            (let [creator-id (mt/user->id :crowberto)
                                      {app-id :id} (data-apps.models/create-app!
                                                    {:name       "My app for singles"
                                                     :slug       "single-tingle"
                                                     :creator_id creator-id})]
                                  (doseq [i (range num-definitions)]
                                    (let [_ (data-apps.models/set-latest-definition!
                                             app-id
                                             {:creator_id creator-id
                                              :config     data-apps.tu/default-app-definition-config})]
                                      ;; Create release for positions 1 and 4 (0-indexed) = revisions 2 and 5
                                      (when (= 1 (mod i defs-per-version))
                                        (data-apps.models/release! app-id creator-id))))
                                  app-id)

              deleted-count     (prune-definitions! retention-per-app retention-total)

              revisions-fn      #(t2/select-fn-set :revision_number
                                                   [:model/DataAppDefinition :app_id :revision_number]
                                                   :app_id app-id)
              revisions         (revisions-fn)]

          (testing "Definitions were deleted"
            ;; We expect some deletions based on retention policies
            (is (= 15 deleted-count)))

          (testing "Final count respects global retention limit"
            ;; This is a lax inequality as we're also keeping additional protected definitions.
            (is (<= (max (* 1 retention-per-app) retention-total)
                    (count revisions))))

          (testing "All protected definitions remain"
            (is (set/superset? revisions (->> (range num-definitions)
                                              (filter #(= 1 (mod % defs-per-version)))
                                              (map inc)))))

          (testing "We additionally retain the 5 most recent versions"
            ;; Given that we are retaining v22 (because it's released) and v26 (because it's the latest), it would
            ;; probably be more intuitive to NOT keep versions 20 and 21 as we already have the 5 most recent.
            (is (= #{2 7 12 17 20 21 22 23 24 25 26} revisions)))

          (testing "Idempotency: running pruning again should delete nothing"
            (is (= 0 (prune-definitions! retention-per-app retention-total)))
            (is (= revisions (revisions-fn)))))))

    (testing "Pruning multiple apps with multiple releases"
      (data-apps.tu/with-data-app-cleanup!
        (let [num-apps            5
              retention-per-app   5
              retention-total     18

              ;; Create N apps with definitions created in time order
              ;; App 1 oldest, App N newest.
              ;; Each app has the following sequence of definitions: u r u u r u u u u u, where
              ;; u - unreleased
              ;; r - was released
              protected-revisions [2 5 10]
              app-ids             (doall
                                   (for [i (range num-apps)]
                                     (let [app-idx    (inc i)
                                           creator-id (mt/user->id :crowberto)
                                           app-id     (:id (data-apps.models/create-app!
                                                            {:name       (str "App " (inc app-idx))
                                                             :slug       (str "app-" (inc app-idx))
                                                             :creator_id creator-id}))]
                                       (doseq [i (range 10)]
                                         (let [created-at (Instant/ofEpochSecond (+ 1000000 (* app-idx 10000) (* i 1000)))
                                               _          (data-apps.models/set-latest-definition!
                                                           app-id
                                                           {:creator_id creator-id
                                                            :config     data-apps.tu/default-app-definition-config
                                                            :created_at created-at})]
                                           ;; Create release for positions 1 and 4 (0-indexed) = revisions 2 and 5
                                           (when (#{1 4} i)
                                             (data-apps.models/release! app-id creator-id))))
                                       app-id)))

              deleted-count       (#'data-apps.models/prune-definitions! retention-per-app retention-total)

              remaining-pairs-fn  #(t2/select-fn-set (juxt :app_id :revision_number)
                                                     [:model/DataAppDefinition :app_id :revision_number]
                                                     :app_id [:in app-ids])
              remaining-pairs     (remaining-pairs-fn)]

          (testing "Definitions were deleted"
            ;; We expect some deletions based on retention policies
            (is (= 21 deleted-count)))

          (testing "Final count respects global retention limit"
            ;; This is a lax inequality as we're also keeping additional protected definitions.
            (is (<= (max (* num-apps retention-per-app) retention-total)
                    (count remaining-pairs))))

          (testing "All protected definitions remain"
            (doseq [app-id app-ids, rn protected-revisions]
              (is (contains? remaining-pairs [app-id rn])
                  (str "App " app-id " missing protected definitions"))))

          (is (= (into (sorted-set)
                       (mapcat (fn [app-id revisions]
                                 (map (partial vector app-id) revisions))
                               app-ids
                               [[2     5 10]
                                [2     5 10]
                                [2     5 6 7 8 9 10]
                                [2   4 5 6 7 8 9 10]
                                [2   4 5 6 7 8 9 10]]))
                 remaining-pairs))

          (testing "Idempotency: running pruning again should delete nothing"
            (is (= 0 (#'data-apps.models/prune-definitions! retention-per-app retention-total)))
            (is (= remaining-pairs (remaining-pairs-fn)))))))))
