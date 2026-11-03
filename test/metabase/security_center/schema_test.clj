(ns metabase.security-center.schema-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.security-center.schema :as schema]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel semver-test
  (testing "accepts versions with any number of dot-separated numeric segments"
    (doseq [v ["1.57" "1.57.19" "0.50.2" "1.58.14" "10.0.0"
               "1.57.19.1" "1.58.14.1" "1.57.19.1.2"]]
      (is (mr/validate ::schema/semver v)
          v)))
  (testing "rejects non-versions"
    (doseq [v ["1." ".1" "1..2" "foo" "1.57.x"]]
      (is (not (mr/validate ::schema/semver v))
          v))))

(def ^:private health-check-example
  "A full `HealthCheck`, with keywords where the API encodes strings."
  {:id               :read-only-connections
   :severity         :high
   :title            "Database connections are read-only"
   :description      "…"
   :remediation      "…"
   :docs             {:page "databases/users-roles-privileges"}
   :requires_restart false
   :status           :fail
   :running          false
   :checked_at       (t/offset-date-time 2026 10 29 10 0 0)
   :items            [{:status      :fail
                       :message     "The connection user can insert, update or delete"
                       :entity_type :database
                       :entity_id   1
                       :entity_name "Warehouse"}
                      {:status      :unknown
                       :message     "Snowflake is not supported"
                       :entity_type :database
                       :entity_id   2
                       :entity_name "Analytics"}]})

(deftest ^:parallel health-check-test
  (testing "a full example validates"
    (is (mr/validate ::schema/health-check health-check-example)))
  (testing "an item without an entity, and an item about the root collection, validate"
    (is (mr/validate ::schema/health-check-item {:status :pass :message "MB_ENCRYPTION_SECRET_KEY is set"}))
    (is (mr/validate ::schema/health-check-item {:status      :fail
                                                 :message     "All Users can curate Our analytics"
                                                 :entity_type :collection
                                                 :entity_id   "root"
                                                 :entity_name "Our analytics"})))
  (testing "a docs anchor is optional"
    (is (mr/validate ::schema/health-check-docs {:page "configuring-metabase/environment-variables"}))
    (is (mr/validate ::schema/health-check-docs {:page   "configuring-metabase/environment-variables"
                                                 :anchor "mb_session_secret_key"})))
  (testing "rejects what the API must never return"
    (doseq [[reason check] {"an unknown check id"   (assoc health-check-example :id :production-app-db)
                            "a status outside the three" (assoc health-check-example :status :error)
                            "no items"              (assoc health-check-example :items [])
                            "a key the type lacks"  (assoc health-check-example :acknowledged_at nil)
                            "docs without a page"   (assoc health-check-example :docs {:anchor "x"})
                            "an entity id of zero"  (assoc-in health-check-example [:items 0 :entity_id] 0)}]
      (is (not (mr/validate ::schema/health-check check))
          reason))))
