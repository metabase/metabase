(ns metabase.lib.join-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel resolve-join-test
  (let [query       (lib/query meta/metadata-provider (meta/table-metadata :venues))
        join-clause (-> ((lib/join-clause
                          (meta/table-metadata :categories)
                          (lib/=
                           (lib/field (meta/id :venues :category-id))
                           (lib/with-join-alias (lib/field (meta/id :categories :id)) "CATEGORIES__via__CATEGORY_ID")))
                         query -1)
                        ;; TODO -- need a nice way to set the alias of a join.
                        (assoc :alias "CATEGORIES__via__CATEGORY_ID"))
        query       (lib/join query join-clause)]
    (is (= join-clause
           (lib.join/resolve-join query -1 "CATEGORIES__via__CATEGORY_ID")))))

(deftest ^:parallel join-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :venues)
                       :joins        [{:lib/type    :mbql/join
                                       :lib/options {:lib/uuid string?}
                                       :stages      [{:lib/type     :mbql.stage/mbql
                                                      :lib/options  {:lib/uuid string?}
                                                      :source-table (meta/id :categories)}]
                                       :condition   [:=
                                                     {:lib/uuid string?}
                                                     [:field {:lib/uuid string?} (meta/id :venues :category-id)]
                                                     [:field {:lib/uuid string?} (meta/id :categories :id)]]}]}]}
          (let [q (lib/query-for-table-name meta/metadata-provider "VENUES")]
            (-> q
                (lib/join (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
                          {:operator :=
                           :args [(lib/ref (lib.metadata/field q nil "VENUES" "CATEGORY_ID"))
                                  (lib/ref (lib.metadata/field q nil "CATEGORIES" "ID"))]})
                (dissoc :lib/metadata))))))

(deftest ^:parallel join-saved-question-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :categories)
                       :joins        [{:lib/type    :mbql/join
                                       :lib/options {:lib/uuid string?}
                                       :stages      [{:lib/type     :mbql.stage/mbql
                                                      :lib/options  {:lib/uuid string?}
                                                      :source-table (meta/id :venues)}]
                                       :condition   [:=
                                                     {:lib/uuid string?}
                                                     [:field {:lib/uuid string?} (meta/id :venues :category-id)]
                                                     [:field {:lib/uuid string?} (meta/id :categories :id)]]}]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
              (lib/join (lib/saved-question-query meta/metadata-provider meta/saved-question)
                        (lib/= (lib/field "VENUES" "CATEGORY_ID")
                               (lib/field "CATEGORIES" "ID")))
              (dissoc :lib/metadata)))))

(deftest ^:parallel join-condition-field-metadata-test
  (testing "Should be able to use raw Field metadatas in the join condition"
    (let [q1                          (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
          q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
          venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
          categories-id-metadata      (lib.metadata/stage-column q2 "ID")]
      (testing "lib/join-clause: return a function that can be resolved later"
        (let [f (lib/join-clause q2 (lib/= venues-category-id-metadata categories-id-metadata))]
          (is (fn? f))
          (is (=? {:lib/type    :mbql/join
                   :lib/options {:lib/uuid string?}
                   :stages      [{:lib/type     :mbql.stage/mbql
                                  :lib/options  {:lib/uuid string?}
                                  :source-table (meta/id :venues)}]
                   :condition   [:=
                                 {:lib/uuid string?}
                                 [:field {:lib/uuid string?} (meta/id :venues :category-id)]
                                 [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]}
                  (f {:lib/metadata meta/metadata} -1)))))
      (is (=? {:database (meta/id)
               :stages   [{:source-table (meta/id :categories)
                           :joins        [{:lib/type    :mbql/join
                                           :lib/options {:lib/uuid string?}
                                           :stages      [{:source-table (meta/id :venues)}]
                                           :condition   [:=
                                                         {:lib/uuid string?}
                                                         [:field {:lib/uuid string?} (meta/id :venues :category-id)]
                                                         [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]]}]}]}
              (-> q1
                  (lib/join q2 (lib/= venues-category-id-metadata categories-id-metadata))
                  (dissoc :lib/metadata)))))))

(deftest ^:parallel col-info-implicit-join-test
  (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk_field_id` "
                "info about the source Field")
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.convert/->pMBQL
                  {:database (meta/id)
                   :type     :query
                   :query    {:source-table (meta/id :venues)
                              :fields       [[:field (meta/id :categories :name) {:source-field (meta/id :venues :category-id)}]]}}))]
      (is (=? [{:name        "NAME"
                :id          (meta/id :categories :name)
                :fk_field_id (meta/id :venues :category-id)
                :lib/source  :source/fields}]
              (lib.metadata.calculation/metadata query -1 query))))))

(deftest ^:parallel col-info-explicit-join-test
  (testing "Display name for a joined field should include a nice name for the join; include other info like :source_alias"
    (let [query {:lib/type     :mbql/query
                 :type         :pipeline
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :lib/options  {:lib/uuid "fdcfaa06-8e65-471d-be5a-f1e821022482"}
                                 :source-table (meta/id :venues)
                                 :fields       [[:field
                                                 {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                  :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
                                                 (meta/id :categories :name)]]
                                 :joins        [{:lib/type    :mbql/join
                                                 :lib/options {:lib/uuid "490a5abb-54c2-4e62-9196-7e9e99e8d291"}
                                                 :alias       "CATEGORIES__via__CATEGORY_ID"
                                                 :condition   [:=
                                                               {:lib/uuid "cc5f6c43-1acb-49c2-aeb5-e3ff9c70541f"}
                                                               (lib.tu/field-clause :venues :category-id)
                                                               (lib.tu/field-clause :categories :id {:join-alias "CATEGORIES__via__CATEGORY_ID"})]
                                                 :strategy    :left-join
                                                 :fk-field-id (meta/id :venues :category-id)
                                                 :stages      [{:lib/type     :mbql.stage/mbql
                                                                :lib/options  {:lib/uuid "bbbae500-c972-4550-b100-e0584eb72c4d"}
                                                                :source-table (meta/id :categories)}]}]}]
                 :database     (meta/id)
                 :lib/metadata meta/metadata-provider}]
      (let [metadata (lib.metadata.calculation/metadata query)]
        (is (=? [(merge (meta/field-metadata :categories :name)
                        {:display_name                  "Categories → Name"
                         :lib/source                    :source/fields
                         :metabase.lib.field/join-alias "CATEGORIES__via__CATEGORY_ID"})]
                metadata))
        (is (=? "CATEGORIES__via__CATEGORY_ID"
                (lib.join/current-join-alias (first metadata))))
        (is (=? [:field
                 {:lib/uuid string?, :join-alias "CATEGORIES__via__CATEGORY_ID"}
                 (meta/id :categories :name)]
                (lib/ref (first metadata))))))))
