(ns metabase-enterprise.content-diagnostics.task.finding-trimmer-test
  "The trimmer's retention window: which invalidated findings the scheduled task deletes, and which it
  leaves in place."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase-enterprise.content-diagnostics.task.finding-trimmer :as task.finding-trimmer]
   [metabase-enterprise.content-diagnostics.test-util :as cd.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-finding!
  [entity-id invalidated-at]
  (cd.test-util/insert-finding! "finding-trimmer-test" entity-id invalidated-at))

(defn- days-ago
  [n]
  (t/minus (t/offset-date-time) (t/days (long n))))

(deftest trims-findings-past-the-retention-window-test
  (testing "findings invalidated longer ago than the retention window are deleted; newer and active ones stay"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      ;; the only test that runs at the real cutoff, so it can also sweep up an expired finding
      ;; another suite left behind; the assertion is id-scoped so that cannot affect the result
      (let [retention (cd.settings/content-diagnostics-finding-retention-days)
            old       (insert-finding! 1 (days-ago (inc retention)))
            recent    (insert-finding! 2 (days-ago (dec retention)))
            active    (insert-finding! 3 nil)]
        (#'task.finding-trimmer/trim-old-findings!)
        (is (= #{recent active}
               (t2/select-pks-set :model/ContentDiagnosticsFinding
                                  {:where [:in :id [old recent active]]})))))))

(deftest honors-the-retention-setting-test
  (testing "a longer retention window spares findings the default would have deleted"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      ;; under the 30-day default both fixtures would be deleted, so `recent` surviving is what
      ;; proves the task read the setting
      (let [retention-days (* 365 5)
            old            (insert-finding! 4 (days-ago (* 365 6)))
            recent         (insert-finding! 5 (days-ago 365))]
        (mt/with-temporary-setting-values [content-diagnostics-finding-retention-days retention-days]
          (#'task.finding-trimmer/trim-old-findings!))
        (is (= #{recent}
               (t2/select-pks-set :model/ContentDiagnosticsFinding
                                  {:where [:in :id [old recent]]})))))))
