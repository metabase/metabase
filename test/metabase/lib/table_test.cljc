(ns metabase.lib.table-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli :as mu]))

(deftest ^:parallel join-table-metadata-test
  (testing "You should be able to pass :metadata/table to lib/join INDIRECTLY VIA join-clause"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
      (binding [mu/*enforce* false]
        (is (sequential? (lib.metadata.calculation/visible-columns query)))))))
