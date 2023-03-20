(ns metabase.lib.limit-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel limit-test
  (letfn [(limit [query]
            (get-in query [:stages 0 :limit] ::not-found))]
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/limit 100))]
      (is (= 100
             (limit query)))
      (is (=? {:stages [{:source-table (meta/id :venues)
                         :limit        100}]}
              query))
      (testing "remove a limit"
        (is (= ::not-found
               (limit (-> query
                          (lib/limit nil)))))))))
