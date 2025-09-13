(ns metabase.lib.table-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel join-table-metadata-test
  (testing "You should be able to pass :metadata/table to lib/join INDIRECTLY VIA join-clause"
    (let [query (-> (lib.tu/venues-query)
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
          #_{:clj-kondo/ignore [:missing-protocol-method]}
          (reify
            metadata.protocols/MetadataProvider
            (database [_this]
              (metadata.protocols/database meta/metadata-provider))
            (metadatas [_this {metadata-type :lib/type, :as metadata-spec}]
              (cond->> (metadata.protocols/metadatas meta/metadata-provider metadata-spec)
                (= metadata-type :metadata/column)
                (mapv (fn [field]
                        (assoc field :name nil)))))
            (setting [_this _setting-key]
              nil))
          query (lib/query metadata-provider (meta/table-metadata :venues))]
      (mu/disable-enforcement
        (is (sequential? (lib/visible-columns query)))))))

(deftest ^:parallel returned-columns-ordering-test
  (testing "check we fetch Fields in the right order"
    (let [mp (lib.tu/merged-mock-metadata-provider
              meta/metadata-provider
              {:fields [{:id       (meta/id :venues :price)
                         :position -1}]})]
      (is (=? [;; sorted first because it has lowest position
               {:position -1, :name "PRICE", :semantic-type :type/Category}
               ;; PK
               {:position 0, :name "ID", :semantic-type :type/PK}
               ;; Name
               {:position 1, :name "NAME", :semantic-type :type/Name}
               ;; The rest are sorted by name
               {:position 2, :name "CATEGORY_ID", :semantic-type :type/FK}
               {:position 3, :name "LATITUDE", :semantic-type :type/Latitude}
               {:position 4, :name "LONGITUDE", :semantic-type :type/Longitude}]
              (lib/returned-columns (lib/native-query mp "WHATEVER") (lib.metadata/table mp (meta/id :venues))))))))
