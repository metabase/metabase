(ns metabase.lib.table-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.composed-provider :as lib.metadata.composed-provider]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [metabase.lib.join :as lib.join]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel join-table-metadata-test
  (testing "You should be able to pass :metadata/table to lib/join INDIRECTLY VIA join-clause"
    (let [query (-> lib.tu/venues-query
                    (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all)
                                  (lib/with-join-conditions [(lib/= (meta/field-metadata :venues :category-id)
                                                                    (-> (meta/field-metadata :categories :id)
                                                                        (lib/with-join-alias "Cat")))]))))]
      (is (=? {:stages [{:joins
                         [{:stages     [{}]
                           :alias      "Cat"
                           :fields     :all
                           :conditions [[:=
                                         {}
                                         [:field {} (meta/id :venues :category-id)]
                                         [:field {:join-alias "Cat"} (meta/id :categories :id)]]]}]}]}
              query)))))

(deftest ^:parallel nil-column-test
  (testing "Fields with missing names shouldn't blow up visible-columns"
    (let [metadata-provider
          (reify
            metadata.protocols/MetadataProvider
            (database [_this]          (metadata.protocols/database meta/metadata-provider))
            (table    [_this table-id] (metadata.protocols/table meta/metadata-provider table-id))
            (field    [_this field-id] (assoc (metadata.protocols/field meta/metadata-provider field-id) :name nil))
            (tables   [_this]          (metadata.protocols/tables meta/metadata-provider))
            (fields   [_this table-id] (mapv #(assoc % :name nil)
                                             (metadata.protocols/fields meta/metadata-provider table-id))))
          query (lib/query metadata-provider (meta/table-metadata :venues))]
      (mu/disable-enforcement
        (is (sequential? (lib.metadata.calculation/visible-columns query)))))))

(def ^:private metadata-provider-with-external-remap
  (lib.metadata.composed-provider/composed-metadata-provider
   (lib.tu/mock-metadata-provider
    {:fields [(assoc (meta/field-metadata :venues :category-id)
                     :lib/external-remap {:id       100
                                          :name     "Category name [external remap]"
                                          :field-id (meta/id :categories :name)})]})
   meta/metadata-provider))

(deftest ^:parallel include-external-remappings-test
  (testing "calculated metadata should include external remappings (#33091)"
    (let [query (lib/query metadata-provider-with-external-remap (meta/table-metadata :venues))]
      (is (=? [{:id                       (meta/id :venues :id)
                :lib/desired-column-alias "ID"}
               {:id                       (meta/id :venues :name)
                :lib/desired-column-alias "NAME"}
               {:id                       (meta/id :venues :category-id)
                :lib/desired-column-alias "CATEGORY_ID"
                :lib/external-remap       {:id       100
                                           :name     "Category name [external remap]"
                                           :field-id (meta/id :categories :name)}
                :remapped-to              "CATEGORIES__via__CATEGORY_ID__NAME"}
               {:id                       (meta/id :venues :latitude)
                :lib/desired-column-alias "LATITUDE"}
               {:id                       (meta/id :venues :longitude)
                :lib/desired-column-alias "LONGITUDE"}
               {:id                       (meta/id :venues :price)
                :lib/desired-column-alias "PRICE"}
               {:lib/source               :source/external-remaps
                :id                       (meta/id :categories :name)
                :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__NAME"
                :remapped-from            "CATEGORY_ID"
                :fk-field-id              (meta/id :venues :category-id)}]
              (lib.metadata.calculation/returned-columns query))))))

(deftest ^:parallel reuse-explicit-joins-test
  (testing "Metadata should assume existing joins will be reused for implicit joins where appropriate"
    (let [query (lib/query metadata-provider-with-external-remap (meta/table-metadata :venues))
          query (-> query
                    (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                  (lib/with-join-conditions [(lib.join/suggested-join-condition query (meta/table-metadata :categories))]))))]
      (is (=? [{:id                       (meta/id :venues :id)
                :lib/desired-column-alias "ID"}
               {:id                       (meta/id :venues :name)
                :lib/desired-column-alias "NAME"}
               {:id                       (meta/id :venues :category-id)
                :lib/desired-column-alias "CATEGORY_ID"
                :lib/external-remap       {:id       100
                                           :name     "Category name [external remap]"
                                           :field-id (meta/id :categories :name)}
                :remapped-to              "Categories__NAME_2"}
               {:id                       (meta/id :venues :latitude)
                :lib/desired-column-alias "LATITUDE"}
               {:id                       (meta/id :venues :longitude)
                :lib/desired-column-alias "LONGITUDE"}
               {:id                       (meta/id :venues :price)
                :lib/desired-column-alias "PRICE"}
               {:lib/source               :source/joins
                :id                       (meta/id :categories :id)
                :lib/desired-column-alias "Categories__ID"}
               {:lib/source               :source/joins
                :id                       (meta/id :categories :name)
                :lib/desired-column-alias "Categories__NAME"}
               {:lib/source               :source/external-remaps
                :id                       (meta/id :categories :name)
                :lib/desired-column-alias "Categories__NAME_2"
                :remapped-from            "CATEGORY_ID"
                :fk-field-id              (meta/id :venues :category-id)}]
              (lib.metadata.calculation/returned-columns query))))))
