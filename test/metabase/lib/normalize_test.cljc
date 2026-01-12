(ns metabase.lib.normalize-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.test-metadata :as meta]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel do-not-normalize-native-queries-test
  (testing "native queries should NOT get normalized"
    (are [x expected] (= expected
                         (lib/normalize x))
      {"lib/type" "mbql/query"
       "database" 1
       "stages"   [{"lib/type" "mbql.stage/native"
                    "native"   "SELECT COUNT(*) FROM CANS;"}]}
      {:lib/type :mbql/query
       :database 1
       :stages   [{:lib/type :mbql.stage/native
                   :native   "SELECT COUNT(*) FROM CANS;"}]}

      {:lib/type :mbql/query
       :database 1
       :stages   [{"lib/type" "mbql.stage/native"
                   "native"   {:NAME         "FAKE_QUERY"
                               "description" "Theoretical fake query in a JSON-based query lang"}}]}
      {:lib/type :mbql/query
       :database 1
       :stages   [{:lib/type :mbql.stage/native
                   :native   {:NAME         "FAKE_QUERY"
                              "description" "Theoretical fake query in a JSON-based query lang"}}]})))

(deftest ^:parallel normalize-value-test
  (testing ":value clauses in MBQL 5 should use kebab-case-keys"
    (is (= [:value {:lib/uuid       "ca0a1ee8-a9a6-4ca7-8a78-699c352fac7c"
                    :effective-type :type/Integer
                    :some-key       "some key value"}
            "some value"]
           (lib/normalize [:value {:lib/uuid       "ca0a1ee8-a9a6-4ca7-8a78-699c352fac7c"
                                   :effective_type :type/Integer
                                   :some_key       "some key value"}
                           "some value"])
           (lib/normalize ["value" {"lib/uuid"       "ca0a1ee8-a9a6-4ca7-8a78-699c352fac7c"
                                    "effective_type" "type/Integer"
                                    "some_key"       "some key value"}
                           "some value"])))))

(deftest ^:parallel e2e-test
  (is (= {:lib/type :mbql/query
          :database 1
          :stages   [{:lib/type     :mbql.stage/mbql
                      :source-table 1
                      :aggregation  [[:count {:lib/uuid "a6685a7d-62b3-4ceb-a13f-f9db405dcb49"}]]
                      :filters      [[:=
                                      {:lib/uuid "c4984ada-f8fe-4ac2-b6b4-45885527f5b4"}
                                      [:field
                                       {:base-type :type/Integer
                                        :lib/uuid  "5a84d551-ea5f-44f4-952f-2162f05cdcc4"}
                                       1]
                                      4]]}]}
         (lib/normalize
          {"lib/type" "mbql/query"
           "database" 1
           "stages"   [{"lib/type"     "mbql.stage/mbql"
                        "source-table" 1
                        "aggregation"  [["count" {"lib/uuid" "a6685a7d-62b3-4ceb-a13f-f9db405dcb49"}]]
                        "filters"      [["="
                                         {"lib/uuid" "c4984ada-f8fe-4ac2-b6b4-45885527f5b4"}
                                         ["field"
                                          {"base-type" "type/Integer"
                                           "lib/uuid"  "5a84d551-ea5f-44f4-952f-2162f05cdcc4"}
                                          1]
                                         4]]}]}))))

(deftest ^:parallel normalize-native-query-test
  (let [metadata-provider meta/metadata-provider
        query             (lib/query metadata-provider {:lib/type :mbql.stage/native
                                                        :native   "SELECT *;"})]
    (is (= {:lib/type     :mbql/query
            :lib/metadata (lib.metadata.cached-provider/cached-metadata-provider meta/metadata-provider)
            :database     (meta/id)
            :stages       [{:lib/type :mbql.stage/native
                            :native   "SELECT *;"}]}
           (lib/normalize query)))))

(deftest ^:parallel add-uuids-test
  (testing "Normalization should add :lib/uuid if it is missing"
    (is (=? {:lib/type :mbql/query
             :database 1
             :stages   [{:lib/type     :mbql.stage/mbql
                         :source-table 1
                         :aggregation  [[:count {:lib/uuid string?}]]
                         :filters      [[:=
                                         {:lib/uuid string?}
                                         [:field {:lib/uuid string?} 1]
                                         4]]}]}
            (lib/normalize
             {"lib/type" "mbql/query"
              "database" 1
              "stages"   [{"lib/type"     "mbql.stage/mbql"
                           "source-table" 1
                           "aggregation"  [["count" {}]]
                           "filters"      [["=" {} ["field" {} 1] 4]]}]})))))

(deftest ^:parallel normalize-from-json-test
  (let [query '{:lib/type     "mbql/query"
                :lib/metadata nil
                :database     1493
                :stages       ({:joins        ({:lib/type    "mbql/join"
                                                :alias       "CategoriesStats"
                                                :fields      "all"
                                                :conditions
                                                (("="
                                                  #:lib{:uuid "e27ffec5-b743-47ff-a715-91f6d68f0ec1"}
                                                  ("field"
                                                   {:base-type "type/Integer", :lib/uuid "3edfdf40-092e-419e-8637-8df75d11c10e", :effective-type "type/Integer"}
                                                   76329)
                                                  ("field"
                                                   {:base-type      "type/Integer"
                                                    :join-alias     "CategoriesStats"
                                                    :lib/uuid       "ff3dc321-27a7-42d8-a7fc-518160250984"
                                                    :effective-type "type/Integer"}
                                                   76329)))
                                                :stages      ({:lib/type "mbql.stage/mbql", :source-card 13281})
                                                :lib/options #:lib{:uuid "517699ac-dede-4f6b-bc53-272def3eea8b"}})
                                :lib/type     "mbql.stage/mbql"
                                :source-table 11763
                                :fields       (("field"
                                                {:base-type      "type/BigInteger"
                                                 :lib/uuid       "9aeaa3ff-0c78-48b5-803c-feb828e92c42"
                                                 :effective-type "type/BigInteger"}
                                                76331)
                                               ("field"
                                                {:base-type "type/Text", :lib/uuid "69d0b0d9-31ea-486a-a2b1-d5cfc052e1e3", :effective-type "type/Text"}
                                                76332)
                                               ("field"
                                                {:base-type "type/Integer", :lib/uuid "8680f1f3-7d32-466d-a19d-6dd0a13570dc", :effective-type "type/Integer"}
                                                76329)
                                               ("field"
                                                {:base-type "type/Float", :lib/uuid "1ce9c56b-1a41-4a55-a760-1ead55f9f54f", :effective-type "type/Float"}
                                                76333)
                                               ("field"
                                                {:base-type "type/Float", :lib/uuid "41cd94d5-ee1a-4410-910e-979ba593ad32", :effective-type "type/Float"}
                                                76334)
                                               ("field"
                                                {:base-type "type/Integer", :lib/uuid "9e3d4356-82a4-4145-8004-23a1548c9cba", :effective-type "type/Integer"}
                                                76330)
                                               ("expression" #:lib{:uuid "3ed4feb6-d9b0-4acd-b331-b34607b68422"} "RelativePrice"))
                                :expressions  (("/"
                                                #:lib{:uuid "0123167c-80e2-4175-b270-71a3fba58c51", :expression-name "RelativePrice"}
                                                ("field"
                                                 {:base-type "type/Integer", :lib/uuid "349d9db5-340e-44e2-a7f3-d513d3b9b0cd", :effective-type "type/Integer"}
                                                 76330)
                                                ("field"
                                                 {:join-alias "CategoriesStats", :base-type "type/Float", :lib/uuid "a7d60dc3-529a-434c-9bb7-dde67c2af90e"}
                                                 "AvgPrice")))
                                :limit        3})}]
    (is (= {:database 1493
            :stages   [{:expressions
                        [[:/ {:lib/expression-name "RelativePrice", :lib/uuid "0123167c-80e2-4175-b270-71a3fba58c51"}
                          [:field
                           {:base-type :type/Integer, :effective-type :type/Integer, :lib/uuid "349d9db5-340e-44e2-a7f3-d513d3b9b0cd"}
                           76330]
                          [:field
                           {:base-type :type/Float, :join-alias "CategoriesStats", :lib/uuid "a7d60dc3-529a-434c-9bb7-dde67c2af90e"}
                           "AvgPrice"]]]
                        :fields       [[:field
                                        {:base-type      :type/BigInteger
                                         :lib/uuid       "9aeaa3ff-0c78-48b5-803c-feb828e92c42"
                                         :effective-type :type/BigInteger}
                                        76331]
                                       [:field
                                        {:base-type :type/Text, :lib/uuid "69d0b0d9-31ea-486a-a2b1-d5cfc052e1e3", :effective-type :type/Text}
                                        76332]
                                       [:field
                                        {:base-type      :type/Integer
                                         :lib/uuid       "8680f1f3-7d32-466d-a19d-6dd0a13570dc"
                                         :effective-type :type/Integer}
                                        76329]
                                       [:field
                                        {:base-type :type/Float, :lib/uuid "1ce9c56b-1a41-4a55-a760-1ead55f9f54f", :effective-type :type/Float}
                                        76333]
                                       [:field
                                        {:base-type :type/Float, :lib/uuid "41cd94d5-ee1a-4410-910e-979ba593ad32", :effective-type :type/Float}
                                        76334]
                                       [:field
                                        {:base-type      :type/Integer
                                         :lib/uuid       "9e3d4356-82a4-4145-8004-23a1548c9cba"
                                         :effective-type :type/Integer}
                                        76330]
                                       [:expression {:lib/uuid "3ed4feb6-d9b0-4acd-b331-b34607b68422"} "RelativePrice"]]
                        :joins        [{:alias       "CategoriesStats"
                                        :conditions  [[:=
                                                       {:lib/uuid "e27ffec5-b743-47ff-a715-91f6d68f0ec1"}
                                                       [:field
                                                        {:base-type :type/Integer, :effective-type :type/Integer, :lib/uuid "3edfdf40-092e-419e-8637-8df75d11c10e"}
                                                        76329]
                                                       [:field
                                                        {:base-type      :type/Integer
                                                         :effective-type :type/Integer
                                                         :join-alias     "CategoriesStats"
                                                         :lib/uuid       "ff3dc321-27a7-42d8-a7fc-518160250984"}
                                                        76329]]]
                                        :fields      :all
                                        :stages      [{:source-card 13281, :lib/type :mbql.stage/mbql}]
                                        :lib/options {:lib/uuid "517699ac-dede-4f6b-bc53-272def3eea8b"}
                                        :lib/type    :mbql/join}]
                        :limit        3
                        :source-table 11763
                        :lib/type     :mbql.stage/mbql}]
            :lib/type :mbql/query}
           (lib/normalize query)))))
