(ns metabase.lib.schema.util-test
  (:require
   [clojure.test :refer [are deftest is]]
   [metabase.lib.schema.util :as lib.schema.util]))

(defn- query [uuid-1 uuid-2]
  {:lib/type :mbql/query
   :type     :pipeline
   :database 1
   :stages   [{:lib/type     :mbql.stage/mbql
               :source-table 2
               :filter       [:=
                              {:lib/uuid "00000000-0000-0000-0000-000000000010"}
                              [:field
                               {:lib/uuid uuid-1, :base-type :type/Text}
                               3]
                              4]}
              {:lib/type :mbql.stage/mbql
               :filter   [:=
                          {:lib/uuid "00000000-0000-0000-0000-000000000020"}
                          [:field
                           {:lib/uuid uuid-2, :base-type :type/Text}
                           "my_field"]
                          4]}]})

(def query-with-no-duplicate-uuids
  (query "00000000-0000-0000-0000-000000000001"
         "00000000-0000-0000-0000-000000000002"))

(def query-with-duplicate-uuids
  (query "00000000-0000-0000-0000-000000000001"
         "00000000-0000-0000-0000-000000000001"))

(deftest ^:parallel collect-uuids-test
  (are [query expected-uuids] (= expected-uuids
                                 (sort (lib.schema.util/collect-uuids query)))
    query-with-no-duplicate-uuids
    ["00000000-0000-0000-0000-000000000001"
     "00000000-0000-0000-0000-000000000002"
     "00000000-0000-0000-0000-000000000010"
     "00000000-0000-0000-0000-000000000020"]

    query-with-duplicate-uuids
    ["00000000-0000-0000-0000-000000000001"
     "00000000-0000-0000-0000-000000000001"
     "00000000-0000-0000-0000-000000000010"
     "00000000-0000-0000-0000-000000000020"]))

(deftest ^:parallel unique-uuids?-test
  (is (lib.schema.util/unique-uuids? query-with-no-duplicate-uuids))
  (is (not (lib.schema.util/unique-uuids? query-with-duplicate-uuids))))
