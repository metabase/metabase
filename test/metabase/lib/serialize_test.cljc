(ns metabase.lib.serialize-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core]
   [metabase.lib.schema :as-alias lib.schema]
   [metabase.lib.schema.binning :as-alias lib.schema.binning]
   [metabase.lib.schema.constraints :as-alias lib.schema.constraints]
   [metabase.lib.schema.middleware-options :as-alias lib.schema.middleware-options]
   [metabase.lib.schema.parameter :as-alias lib.schema.parameter]
   [metabase.lib.schema.template-tag :as-alias lib.schema.template-tag]
   [metabase.lib.serialize :as lib.serialize]))

(comment metabase.lib.core/keep-me)

(deftest ^:parallel strip-internal-keys-test
  (doseq [[schema m]
          [[::lib.schema.binning/binning                       {:strategy :num-bins, :num-bins 8}]
           [::lib.schema.parameter/parameter                   {:type :category, :id "p1"}]
           [::lib.schema.template-tag/template-tag             {:type :text, :name "t", :display-name "T", :id "id1"}]
           [::lib.schema.constraints/constraints               {:max-results 10}]
           [::lib.schema.middleware-options/middleware-options {:userland-query? true}]
           [::lib.schema/page                                  {:page 1, :items 10}]]
          f      [lib.serialize/prepare-after-deserialization
                  lib.serialize/prepare-for-serialization]]
    (testing (str schema " via " f)
      (is (= m (f schema (assoc m :a/b 1)))))))

(deftest ^:parallel remove-info-test
  (is (= {:lib/type :mbql/query
          :stages   [{:lib/type     :mbql.stage/mbql
                      :source-table 1}]
          :database 1}
         (lib.serialize/prepare-for-serialization
          {:lib/type :mbql/query
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 1}]
           :database 1
           :info     {:x 1}}))))

#?(:clj
   (deftest ^:parallel encode-literal-java-time-types-test
     (is (= "2022-10-03T00:00"
            (lib.serialize/prepare-for-serialization
             :metabase.lib.schema.literal/temporal
             #t "2022-10-03T00:00")))))

#?(:clj
   (deftest ^:parallel encode-java-time-types-in-expressions-test
     (is (= "2022-10-03T00:00"
            (lib.serialize/prepare-for-serialization
             :metabase.lib.schema.expression/temporal
             #t "2022-10-03T00:00")))))

#?(:clj
   (deftest ^:parallel encode-java-time-types-in-expressions-test-2
     (is (= [:datetime-add {:lib/uuid            "0b5cf908-caa0-45f8-92e9-90e3b939b14a"
                            :lib/expression-name "second"}
             "2022-10-03T00:00"
             1
             :day]
            (lib.serialize/prepare-for-serialization
             :mbql.clause/datetime-add
             [:datetime-add {:lib/uuid            "0b5cf908-caa0-45f8-92e9-90e3b939b14a"
                             :lib/expression-name "second"}
              #t "2022-10-03T00:00"
              1
              :day])))))

#?(:clj
   (deftest ^:parallel encode-java-time-types-in-expressions-test-3
     (is (= {:lib/type :mbql/query
             :stages   [{:lib/type     :mbql.stage/mbql
                         :limit        1
                         :expressions  [[:datetime-add {:lib/uuid            "0b5cf908-caa0-45f8-92e9-90e3b939b14a"
                                                        :lib/expression-name "second"}
                                         "2022-10-03T00:00"
                                         1
                                         :day]]
                         :source-table 1}]
             :database 1}
            (lib.serialize/prepare-for-serialization
             {:lib/type :mbql/query
              :stages   [{:lib/type     :mbql.stage/mbql
                          :limit        1
                          :expressions  [[:datetime-add {:lib/uuid            "0b5cf908-caa0-45f8-92e9-90e3b939b14a"
                                                         :lib/expression-name "second"}
                                          #t "2022-10-03T00:00"
                                          1
                                          :day]]
                          :source-table 1}]
              :database 1})))))

#?(:clj
   (deftest ^:parallel encode-java-time-types-in-native-query-args-test
     (is (= {:lib/type :mbql/query
             :stages   [{:lib/type :mbql.stage/native
                         :native   "SELECT *"
                         :params   ["2022-10-03T00:00"]}]
             :database 1}
            (lib.serialize/prepare-for-serialization
             {:lib/type :mbql/query
              :stages   [{:lib/type :mbql.stage/native
                          :native   "SELECT *"
                          :params   [#t "2022-10-03T00:00"]}]
              :database 1})))))
