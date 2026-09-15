(ns ^:mb/driver-tests metabase.driver.mongo.pivot-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.mongo.execute :as mongo.execute]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.pivot :as lib.pivot]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.store :as qp.store])
  (:import
   (com.mongodb MongoCommandException ServerAddress)
   (org.bson BsonDocument BsonDouble BsonInt32 BsonString)))

(defn- with-pivot
  "Attach a `:pivot` clause to the last stage of `query` from row/column breakout indexes."
  [query row-idxs col-idxs & {:keys [show-row-totals show-column-totals]
                              :or   {show-row-totals true, show-column-totals true}}]
  (let [uuids (mapv lib.options/uuid (lib/breakouts query))]
    (lib.pivot/with-pivot query
      {:rows               (mapv uuids row-idxs)
       :columns            (mapv uuids col-idxs)
       :show-row-totals    show-row-totals
       :show-column-totals show-column-totals})))

(defn- compile-pivot
  "Compile `query` through the Mongo QP and return the aggregation-pipeline vector."
  [query]
  (qp.store/with-metadata-provider meta/metadata-provider
    (binding [driver/*driver* :mongo]
      (:query (mongo.qp/mbql->native query)))))

(defn- two-breakout-orders-count
  "Fixture: `orders` grouped by product-id + user-id with a `count` aggregation."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/breakout (meta/field-metadata :orders :product-id))
      (lib/breakout (meta/field-metadata :orders :user-id))
      (lib/aggregate (lib/count))))

(defn- facet-branches
  "Extract the ordered `[facet-key branch-pipeline]` pairs from the pivot pipeline's `$facet` stage."
  [pipeline]
  (seq (get (first pipeline) "$facet")))

(defn- branch-project
  "Return the `$project` map from a facet branch — the last stage in the branch pipeline."
  [branch-pipeline]
  (get (last branch-pipeline) "$project"))

(defn- branch-bitmask
  "The `pivot-grouping` literal value embedded in a facet branch's final `$project`."
  [branch-pipeline]
  (get-in (branch-project branch-pipeline) ["pivot-grouping" "$literal"]))

(deftest ^:parallel top-level-pipeline-shape-test
  (testing "the compiled pivot pipeline has [$facet, $addFields, $unwind, $replaceRoot, $sort] after any shared upstream"
    (let [pipeline (compile-pivot (with-pivot (two-breakout-orders-count) [0] [1]))
          top-keys (mapv #(first (keys %)) pipeline)]
      (is (= ["$facet" "$addFields" "$unwind" "$replaceRoot" "$sort"] top-keys)))))

(deftest ^:parallel facet-branch-count-test
  (testing "a 2-breakout pivot with both totals produces 4 branches (detail + row-totals + col-totals + grand-total)"
    (is (= 4 (count (facet-branches (compile-pivot (with-pivot (two-breakout-orders-count) [0] [1])))))))
  (testing "with both totals off there is exactly 1 branch (detail only)"
    (is (= 1 (count (facet-branches (compile-pivot (with-pivot (two-breakout-orders-count) [0] [1]
                                                     :show-row-totals    false
                                                     :show-column-totals false))))))))

(deftest ^:parallel branch-bitmasks-test
  (testing "each branch's pivot-grouping literal covers 0..2^n-1 exactly once for an n-breakout pivot with both totals"
    (let [pipeline (compile-pivot (with-pivot (two-breakout-orders-count) [0] [1]))
          bitmasks (mapv (fn [[_ branch]] (branch-bitmask branch)) (facet-branches pipeline))]
      (is (= #{0 1 2 3} (set bitmasks))))))

(deftest ^:parallel branch-projections-align-test
  (testing "every branch's final $project emits the same columns in the same order — required so $concatArrays
            produces a rectangular row stream"
    (let [pipeline (compile-pivot (with-pivot (two-breakout-orders-count) [0] [1]))
          projects (mapv (fn [[_ branch]] (branch-project branch)) (facet-branches pipeline))]
      (is (apply = (map keys projects))))))

(deftest ^:parallel null-padding-test
  (testing "dropped breakouts are emitted as {\"$literal\" nil} in each branch's $project"
    (let [pipeline (compile-pivot (with-pivot (two-breakout-orders-count) [0] [1]))]
      (doseq [[k branch] (facet-branches pipeline)]
        (let [proj    (branch-project branch)
              bitmask (branch-bitmask branch)]
          (testing (str k " (pivot-grouping " bitmask ")")
            ;; bit 0 = first breakout excluded, bit 1 = second breakout excluded
            (when (bit-test bitmask 0)
              (is (= {"$literal" nil} (get proj "PRODUCT_ID"))))
            (when (bit-test bitmask 1)
              (is (= {"$literal" nil} (get proj "USER_ID"))))
            (when-not (bit-test bitmask 0)
              (is (= "$_id.PRODUCT_ID" (get proj "PRODUCT_ID"))))
            (when-not (bit-test bitmask 1)
              (is (= "$_id.USER_ID" (get proj "USER_ID")))))))))
  (testing "grand-total branch groups by _id: nil"
    (let [pipeline (compile-pivot (with-pivot (two-breakout-orders-count) [0] [1]))
          [_k grand-total-branch] (last (facet-branches pipeline))]
      (is (nil? (get-in (first grand-total-branch) ["$group" "_id"]))))))

(deftest ^:parallel outer-sort-test
  (testing "the outer $sort leads with pivot-grouping ASC so grand totals sort last, then breakouts as a canonical tiebreaker"
    (let [pipeline  (compile-pivot (with-pivot (two-breakout-orders-count) [0] [1]))
          sort-map  (get (last pipeline) "$sort")
          sort-keys (vec (keys sort-map))]
      (is (= "pivot-grouping" (first sort-keys)))
      (is (every? #(= 1 (get sort-map %)) sort-keys))
      (is (= #{"pivot-grouping" "PRODUCT_ID" "USER_ID"} (set sort-keys))))))

;;; ------------------------------------- 16 MB overflow translation --------------------------------------

(defn- bson-object-too-large-exception
  "A synthetic `MongoCommandException` with error code 10334 (BSONObjectTooLarge), for exercising the
  execute-layer translator without a live MongoDB."
  []
  (MongoCommandException.
   (doto (BsonDocument.)
     (.put "ok"     (BsonDouble. 0.0))
     (.put "code"   (BsonInt32. 10334))
     (.put "errmsg" (BsonString. "BSONObjectTooLarge")))
   (ServerAddress. "test-host")))

(deftest ^:parallel bson-overflow-on-pivot-produces-actionable-error-test
  (testing "code 10334 on a pipeline that contains $facet is translated with a message naming both remediations"
    (let [native  {:query      [{"$facet" {"combo_0" []}}]
                   :collection "orders"}
          wrapped (#'mongo.execute/translate-cursor-error (bson-object-too-large-exception) native)]
      (is (= 10334 (:error-code (ex-data wrapped))))
      (is (= :invalid-query (:type (ex-data wrapped))))
      (is (str/includes? (ex-message wrapped) "16 MB"))
      (is (str/includes? (ex-message wrapped) "use-native-pivot-tables")))))

(deftest ^:parallel bson-overflow-on-non-pivot-falls-through-test
  (testing "code 10334 on a pipeline without $facet gets the generic wrapping (no pivot-specific advice)"
    (let [native  {:query      [{"$match" {}}]
                   :collection "orders"}
          wrapped (#'mongo.execute/translate-cursor-error (bson-object-too-large-exception) native)]
      (is (nil? (:error-code (ex-data wrapped))))
      (is (not (str/includes? (ex-message wrapped) "use-native-pivot-tables"))))))

(deftest ^:parallel non-mongo-error-falls-through-test
  (testing "a non-MongoCommandException throwable on a pivot pipeline gets the generic wrapping"
    (let [native  {:query      [{"$facet" {"combo_0" []}}]
                   :collection "orders"}
          wrapped (#'mongo.execute/translate-cursor-error (Exception. "oh no") native)]
      (is (nil? (:error-code (ex-data wrapped))))
      (is (str/includes? (ex-message wrapped) "oh no")))))
