(ns metabase.lib.table-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

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
            (database [_this]
              (metadata.protocols/database meta/metadata-provider))
            (metadatas [_this metadata-type ids]
              (cond->> (metadata.protocols/metadatas meta/metadata-provider metadata-type ids)
                (= metadata-type :metadata/column)
                (mapv (fn [field]
                        (assoc field :name nil)))))
            (tables [_this]
              (metadata.protocols/tables meta/metadata-provider))
            (metadatas-for-table [_this metadata-type table-id]
              (when (= metadata-type :metadata/column)
                (mapv #(assoc % :name nil)
                      (metadata.protocols/fields meta/metadata-provider table-id))))
            (setting [_this _setting-key]
              nil))
          query (lib/query metadata-provider (meta/table-metadata :venues))]
      (mu/disable-enforcement
       (is (sequential? (lib/visible-columns query)))))))
