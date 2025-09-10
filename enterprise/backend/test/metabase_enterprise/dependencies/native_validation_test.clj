(ns metabase-enterprise.dependencies.native-validation-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.native-validation :as deps.native-validation]
   [metabase-enterprise.dependencies.test-util :as deps.tu]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]))

(deftest basic-deps-test
  (let [mp (deps.tu/default-metadata-provider)
        driver (:engine (lib.metadata/database mp))]
    (is (= #{{:table (meta/id :products)}}
           (->> (lib.metadata/card mp 4)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}}
           (->> (lib.metadata/card mp 5)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}
             {:snippet 1}}
           (->> (lib.metadata/card mp 6)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))
    (is (= #{{:table (meta/id :products)}
             {:card 1}
             {:snippet 1}
             {:snippet 2}}
           (->> (lib.metadata/card mp 7)
                :dataset-query
                (deps.native-validation/native-query-deps driver mp))))))
