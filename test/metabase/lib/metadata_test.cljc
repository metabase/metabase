(ns metabase.lib.metadata-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.overhaul :as lib.metadata.overhaul]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-metadata.graph-provider :as meta.graph-provider]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros])
  #?@(:clj ((:import
             metabase.lib.test_metadata.graph_provider.SimpleGraphMetadataProvider))))

(comment lib/keep-me)
#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel field-metadata-test
  (is (=? (merge
           {:lib/type :metadata/column}
           (meta/field-metadata :venues :category-id))
          (lib.metadata/field meta/metadata-provider (meta/id :venues :category-id)))))

(deftest ^:parallel display-name-from-name-test
  (testing "Use the 'simple humanization' logic to calculate a display name for a Field that doesn't have one"
    (is (= "Venue ID"
           (lib/display-name (lib.tu/venues-query) -1 {:lib/type :metadata/column
                                                       :name     "venue_id"})))))

(deftest ^:parallel table-or-card-test
  (are [id expected] (=? expected
                         (lib.metadata/table-or-card lib.tu/metadata-provider-with-card id))
    (meta/id :venues) {:lib/type :metadata/table, :name "VENUES"}
    "card__1"         {:lib/type :metadata/card, :name "My Card"}
    ;; If Card doesn't exist, return `nil`. Generally we have to live with Card not existing sometimes so we don't
    ;; throw...
    "card__2"         nil)
  ;; but if Table isn't present then that is a legitimate error.
  #?(:clj
     (is (thrown-with-msg?
          Throwable
          #"Invalid output:.*Valid Table metadata"
          (lib.metadata/table-or-card lib.tu/metadata-provider-with-card Integer/MAX_VALUE)))
     ;; Doesn't currently throw an error in CLJS because we don't have Malli validation enabled.
     :cljs
     (is (nil? (lib.metadata/table-or-card lib.tu/metadata-provider-with-card js/Number.MAX_SAFE_INTEGER)))))

(deftest ^:parallel bulk-metadata-preserve-order-test
  (lib.tu.macros/with-refs-overhaul
    (testing "bulk-metadata should return things in the same order as the IDs passed in"
      (are [ids expected] (= expected
                             (map :name (lib.metadata/bulk-metadata meta/metadata-provider :metadata/table (map meta/id ids))))
        [:venues :orders :people]
        ["VENUES" "ORDERS" "PEOPLE"]

        [:people :orders :venues]
        ["PEOPLE" "ORDERS" "VENUES"]))))

(deftest ^:parallel editable?-test
  ;; TODO: This can't be overhauled until we have another approach for `query-with-join`. It calls `with-join-alias`
  ;; on a field expecting to get back the joined form, but that's not how it works in the new world!
  (let [query          (lib.tu/query-with-join)
        metadata       ^SimpleGraphMetadataProvider (:lib/metadata query)
        metadata-graph (.-metadata-graph metadata)
        restricted-metadata-graph (update metadata-graph :tables #(into [] (remove (comp #{"CATEGORIES"} :name)) %))
        restricted-provider (meta.graph-provider/->SimpleGraphMetadataProvider restricted-metadata-graph)
        restricted-query (assoc query :lib/metadata restricted-provider)]
    (is (lib.metadata/editable? query))
    (is (not (lib.metadata/editable? restricted-query)))))

(deftest ^:parallel idents-test
  (lib.tu.macros/with-refs-overhaul
    (doseq [table-key (meta/tables)
            field-key (meta/fields table-key)]
      (is (= (meta/ident table-key field-key)
             ((lib.metadata.overhaul/old-new :ident :column/ident)
              (lib.metadata/field meta/metadata-provider (meta/id table-key field-key))))))))
