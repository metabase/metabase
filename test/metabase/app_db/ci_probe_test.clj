(ns metabase.app-db.ci-probe-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ci-probe-33576-created-at-lookup-under-system-timezone-test
  (mt/with-temp [:model/Collection coll {}]
    (mt/with-system-timezone-id "Asia/Tokyo"
      (is (some? (t2/select-one :model/Collection :created_at (:created_at coll)))))))
