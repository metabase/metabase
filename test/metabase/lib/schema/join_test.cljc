(ns metabase.lib.schema.join-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel join-schema-test
  (is (=? {:stages ["should have at least 1 elements" ["end of input"]]}
          (mu.humanize/humanize (mr/explain ::lib.schema.join/join {:stages []}))))
  ;; not sure why these errors are repeated.
  (is (=? {:lib/type "missing required key"
           :stages [{:joins [{:stages [[{:lib/type "missing required key"}
                                        "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"]]
                              :lib/options "missing required key"
                              :conditions  "should have at least 1 elements"}]}]}
          (mu.humanize/humanize (mr/explain ::lib.schema/query {:stages [{:lib/type :mbql.stage/mbql
                                                                          :joins    [{:lib/type :mbql/join
                                                                                      :stages   [{}]
                                                                                      :conditions []
                                                                                      :alias      "join alias"}]}]})))))

(deftest ^:parallel normalize-join-test
  (let [join (lib/normalize
              ::lib.schema.join/join
              {:alias      "Child 1 Child"
               :stages     [{:lib/type :mbql.stage/mbql, :source-table 1}]
               :conditions [[:=
                             [:field {:join-alias "Child 1"} 1]
                             [:field {:join-alias "Child 1 Child"} 1]]]})]
    (is (not (me/humanize (mr/explain ::lib.schema.join/join join))))))

(deftest ^:parallel normalize-source-metadata-test
  (is (=? {:lib/type :mbql/query
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :joins        [{:alias  "Question 54"
                                       :stages [{:lib/type           :mbql.stage/mbql
                                                 :lib/stage-metadata {:lib/type :metadata/results
                                                                      :columns  [{:lib/type     :metadata/column
                                                                                  :name         "ID"
                                                                                  :display-name "ID"}
                                                                                 {:lib/type     :metadata/column
                                                                                  :name         "NAME"
                                                                                  :display-name "Name"
                                                                                  :base-type    :type/Name}]}}]}]}]}
          (lib/query
           meta/metadata-provider
           (lib.tu.macros/mbql-query venues
             {:joins [{:source-table    $$categories
                       :source-metadata [{:name "ID", :base_type :type/Integer, :display_name "ID"}
                                         {:name "NAME", :base_type :type/Name, :display_name "Name"}]
                       :alias           "Question 54"
                       :condition       [:= 1 1]}]})))))

(deftest ^:parallel normalize-join-condition->conditions-test
  (testing "normalize should fix condition => conditions and normalize things inside it"
    (is (=? {:strategy   :left-join
             :stages     [{:source-table 1}]
             :alias      "Cat"
             :conditions [[:= {} [:field {} 2] [:field {:join-alias "Cat"} 3]]]
             :conditon   (symbol "nil #_\"key is not present.\"")
             :fields     [[:field {} 4]]}
            (lib/normalize
             ::lib.schema.join/join
             {:strategy  :left-join
              :stages    [{:source-table 1}]
              :alias     "Cat"
              :condition [:= [:field {} 2] [:field {:join-alias "Cat"} 3]]
              :fields    [[:field {} 4]]})))))

(deftest ^:parallel normalize-join-add-strategy-and-fields-test
  (let [join {:lib/type    :mbql/join
              :lib/options {:lib/uuid "d7ebb6bd-e7ac-411a-9d09-d8b18329ad46"}
              :stages      [{:lib/type    :mbql.stage/mbql
                             :source-card 1}]
              :alias       "checkins_by_user"
              :conditions  [[:=
                             {:lib/uuid "1cb124b0-757f-4717-b8ee-9cf12a7c3f62"}
                             [:field
                              {:lib/uuid "a2eb96a0-420b-4465-817d-f3c9f789eff4"}
                              (meta/id :users :id)]
                             [:field
                              {:base-type  :type/Integer
                               :join-alias "checkins_by_user"
                               :lib/uuid   "b23a769d-774a-4eb5-8fb8-1f6a33c9a8d5"}
                              "USER_ID"]]]}]
    (testing "should infer correct schema to normalize with"
      (is (= ::lib.schema.join/join
             (#'lib.normalize/infer-schema join))))
    (testing "should add default values during normalization"
      (is (=? {:strategy :left-join
               :fields   :none}
              (lib/normalize join)))
      (testing "(via lib/query)"
        (is (=? {:stages [{:joins [{:strategy :left-join, :fields :none}]}]}
                (lib/query
                 meta/metadata-provider
                 {:database (meta/id)
                  :stages   [{:lib/type     :mbql.stage/mbql
                              :source-table (meta/id :checkins)
                              :joins        [join]}]})))))))
