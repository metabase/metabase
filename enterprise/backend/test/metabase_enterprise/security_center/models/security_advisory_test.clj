(ns metabase-enterprise.security-center.models.security-advisory-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.models.security-advisory :as security-advisory]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- insert-advisories!
  "Insert `n` unacknowledged SecurityAdvisories, every second one already naming `user-id` as its acknowledger, and
  return their advisory ids."
  [n user-id]
  (let [advisory-ids (vec (repeatedly n #(str "SC-TEST-" (mt/random-name))))]
    (t2/insert! :model/SecurityAdvisory
                (map-indexed (fn [i advisory-id]
                               (cond-> {:advisory_id       advisory-id
                                        :severity          "high"
                                        :title             "Test Advisory"
                                        :description       "Test description."
                                        :remediation       "Upgrade to fix."
                                        :affected_versions [{"min" "1.50.0" "fixed" "1.58.0"}]
                                        :match_status      "active"
                                        :published_at      #t "2026-03-24T00:00:00Z"
                                        :updated_at        #t "2026-03-24T00:00:00Z"}
                                 (even? i) (assoc :acknowledged_by user-id)))
                             advisory-ids))
    advisory-ids))

(deftest acknowledge-many-statement-count-does-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/SecurityAdvisory]
    (let [user-id (mt/user->id :crowberto)
          counted (fn [n]
                    (let [advisory-ids (insert-advisories! n user-id)]
                      (events.tu/statement-count! #(security-advisory/acknowledge-many! advisory-ids user-id))))]
      (counted 1)
      (is (= (counted 2) (counted 6))))))

(deftest acknowledge-many-stamps-changed-acknowledgers-test
  (mt/with-model-cleanup [:model/SecurityAdvisory]
    (let [user-id      (mt/user->id :crowberto)
          advisory-ids (insert-advisories! 3 user-id)
          acknowledged (security-advisory/acknowledge-many! advisory-ids user-id)]
      (testing "a change of the acknowledger stamps the acknowledgement time, one that keeps it does not"
        (is (= (zipmap advisory-ids [false true false])
               (into {} (map (juxt :advisory_id (comp some? :acknowledged_at))) acknowledged))))
      (testing "the advisories come back with their acknowledging user"
        (is (= #{user-id} (into #{} (map (comp :id :acknowledged_by_user)) acknowledged))))
      (testing "acknowledged advisories are skipped"
        (is (= (into #{} (comp (remove :acknowledged_at) (map :id)) acknowledged)
               (into #{} (map :id) (security-advisory/acknowledge-many! advisory-ids user-id))))))))
