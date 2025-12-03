(ns metabase.lib.metadata-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

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
     ;; doesn't currently throw an error in Cljs because we don't have Malli validation enabled... probably fine for
     ;; now.
     :cljs
     ;; `Integer/MAX_VALUE`, but I don't know what the Cljs way to do this
     (is (nil? (lib.metadata/table-or-card lib.tu/metadata-provider-with-card js/Number.MAX_SAFE_INT)))))

(deftest ^:parallel bulk-metadata-preserve-order-test
  (testing "bulk-metadata should return things in the same order as the IDs passed in"
    (are [ids expected] (= expected
                           (map :name (lib.metadata/bulk-metadata meta/metadata-provider :metadata/table (map meta/id ids))))
      [:venues :orders :people]
      ["VENUES" "ORDERS" "PEOPLE"]

      [:people :orders :venues]
      ["PEOPLE" "ORDERS" "VENUES"])))

(deftest ^:parallel editable?-test
  (let [query               (lib.tu/query-with-join)
        restricted-provider (meta/updated-metadata-provider
                             update :tables #(into [] (remove (comp #{"CATEGORIES"} :name)) %))
        restritcted-query   (assoc query :lib/metadata restricted-provider)]
    (is (lib.metadata/editable? query))
    (is (not (lib.metadata/editable? restritcted-query)))))

(deftest ^:parallel database-supports?-test
  (let [query          (lib.tu/query-with-join)
        provider-with-feature (meta/updated-metadata-provider update :features conj ::special-feature)
        provider-without-feature (meta/updated-metadata-provider update :features disj ::special-feature)
        query-with-feature (assoc query :lib/metadata provider-with-feature)
        query-without-feature (assoc query :lib/metadata provider-without-feature)]
    (is (lib.metadata/database-supports? query-with-feature ::special-feature))
    (is (not (lib.metadata/database-supports? query-without-feature ::special-feature)))))
