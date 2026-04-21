(ns metabase.transforms-base.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]))

(set! *warn-on-reflection* true)

(deftest throw-if-db-routing-enabled!-oss-test
  (testing "on OSS (no :database-routing premium feature) the check is a no-op"
    (mt/with-premium-features #{}
      (is (nil? (transforms-base.u/throw-if-db-routing-enabled!
                 {:name "OSS transform"}
                 (mt/db))))))
  (when config/ee-available?
    (testing "with :database-routing premium feature enabled, the check throws on a routing-enabled database"
      (mt/with-premium-features #{:database-routing}
        (mt/with-temp [:model/DatabaseRouter _ {:database_id    (mt/id)
                                                :user_attribute "db_name"}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #".*database routing turned on"
               (transforms-base.u/throw-if-db-routing-enabled!
                {:name "Routing transform"}
                (mt/db)))))))))
