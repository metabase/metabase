(ns metabase.data-apps.models-test
  "Tests for data apps models"
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.data-apps.models :as data-apps.models]
   [metabase.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(deftest prune-definitions-test
  ;; Prune *everything* unprotected to avoid flakes from other tests, or state in your dev database.
  (testing "Pruning a single app with multiple releases"
    (data-apps.tu/with-data-app-cleanup!
      (#'data-apps.models/prune-definitions! 0 0)
      (let [retention-per-app 5
            retention-total   18

           ;; Create an app with a bunch of releases with a bunch of interspersed definitions.
            num-versions      5
            defs-per-version  5
            num-definitions   (inc (* num-versions defs-per-version))
            app-id            (let [creator_id (mt/user->id :crowberto)
                                    app-id     (t2/insert-returning-pk! :model/DataApp
                                                                        {:name       "My app for singles"
                                                                         :slug       "single-tingle"
                                                                         :creator_id creator_id
                                                                         :status     :private})]
                                (doseq [i (range num-definitions)]
                                  (let [did (t2/insert-returning-pk! :model/DataAppDefinition
                                                                     {:app_id          app-id
                                                                      :creator_id      creator_id
                                                                      :revision_number (inc i)
                                                                      :config          data-apps.tu/default-app-definition-config})]
                                   ;; Create release for positions 1 and 4 (0-indexed) = revisions 2 and 5
                                    (when (= 1 (mod i defs-per-version))
                                      (t2/insert! :model/DataAppRelease
                                                  {:app_id            app-id
                                                   :app_definition_id did
                                                   :creator_id        creator_id}))))
                                app-id)

            deleted-count     (#'data-apps.models/prune-definitions! retention-per-app retention-total)

            revisions-fn      #(t2/select-fn-set :revision_number
                                                 [:model/DataAppDefinition :app_id :revision_number]
                                                 :app_id app-id)
            revisions         (revisions-fn)]

        (testing "Definitions were deleted"
         ;; We expect some deletions based on retention policies
          (is (> deleted-count 0)))

        (testing "Final count respects global retention limit"
         ;; This is a lax inequality as we're also keeping additional protected definitions.
          (is (<= retention-per-app (count revisions))))

        (testing "All protected definitions remain"
          (is (set/superset? revisions (->> (range num-definitions)
                                            (filter #(= 1 (mod % defs-per-version)))
                                            (map inc)))))

        (testing "We additionally retain the 5 most recent versions"
         ;; Given that we are retaining v22 (because it's released) and v26 (because it's the latest), it would
         ;; probably be more intuitive to NOT keep versions 20 and 21 as we already have the 5 most recent.
          (is (= #{2 7 12 17 20 21 22 23 24 25 26} revisions)))

        (testing "Idempotency: running pruning again should delete nothing"
          (is (= 0 (#'data-apps.models/prune-definitions! retention-per-app retention-total)))
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
            app-ids                (doall
                                    (for [i (range num-apps)]
                                      (let [app-idx    (inc i)
                                            creator_id (mt/user->id :crowberto)
                                            app-id     (t2/insert-returning-pk! :model/DataApp
                                                                                {:name       (str "App " (inc app-idx))
                                                                                 :slug       (str "app-" (inc app-idx))
                                                                                 :creator_id creator_id
                                                                                 :status     :private})]
                                        (doseq [i (range 10)]
                                          (let [time (+ 1000000 (* app-idx 10000) (* i 1000))
                                                did  (t2/insert-returning-pk! :model/DataAppDefinition
                                                                              {:app_id          app-id
                                                                               :creator_id      creator_id
                                                                               :revision_number (inc i)
                                                                               :config          data-apps.tu/default-app-definition-config
                                                                               :created_at      (Instant/ofEpochSecond time)})]
                                        ;; Create release for positions 1 and 4 (0-indexed) = revisions 2 and 5
                                            (when (#{1 4} i)
                                              (t2/insert! :model/DataAppRelease
                                                          {:app_id            app-id
                                                           :app_definition_id did
                                                           :creator_id        creator_id
                                                           :created_at        (Instant/ofEpochSecond (+ time 100))}))))
                                        app-id)))

            deleted-count       (#'data-apps.models/prune-definitions! retention-per-app retention-total)

            remaining-pairs-fn  #(t2/select-fn-set (juxt :app_id :revision_number)
                                                   [:model/DataAppDefinition :app_id :revision_number]
                                                   :app_id [:in app-ids])
            remaining-pairs     (remaining-pairs-fn)]

        (testing "Definitions were deleted"
         ;; We expect some deletions based on retention policies
          (is (> deleted-count 0)))

        (testing "Final count respects global retention limit"
         ;; This is a lax inequality as we're also keeping additional protected definitions.
          (is (<= (+ (max (* num-apps retention-per-app) retention-total))
                  (count remaining-pairs))))

        (testing "All protected definitions remain"
          (doseq [app-id app-ids, rn protected-revisions]
            (is (contains? remaining-pairs [app-id rn])
                (str "App " app-id " missing protected definitions"))))

        (is (= (into (sorted-set)
                     (mapcat (fn [app-id revisions]
                               (map (partial vector app-id) revisions))
                             app-ids
                             [[2 5 10]
                              [2 5 10]
                              [2 5 6 7 8 9 10]
                              [2 4 5 6 7 8 9 10]
                              [2 4 5 6 7 8 9 10]]))
               remaining-pairs))

        (testing "Idempotency: running pruning again should delete nothing"
          (is (= 0 (#'data-apps.models/prune-definitions! retention-per-app retention-total)))
          (is (= remaining-pairs (remaining-pairs-fn))))))))
