(ns metabase-enterprise.serialization.v2.serialize-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Collection]]
            [metabase.models.serialization.base :as serdes.base]
            [metabase-enterprise.serialization.v2.serialize :as sut]
            [metabase-enterprise.serialization.v2.models :as serdes.models]
            [metabase-enterprise.serialization.test-util :as ts]
            [toucan.db :as db]
            [toucan.models :as models]))

(deftest collections-test
  (ts/with-world
    (is (= [] (into [] (serdes.base/serialize-all Collection nil)))))
  )
