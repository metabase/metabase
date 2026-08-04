(ns metabase.transforms.crud-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.collections.core :as collections]
   [metabase.test :as mt]
   [metabase.transforms.crud :as transforms.crud]))

(set! *warn-on-reflection* true)

(defn- lookback-transform [field-id lookback]
  {:source {:type "query"
            :source-incremental-strategy {:type "checkpoint"
                                          :checkpoint-filter-field-id field-id
                                          :lookback lookback}}})

(defn- validates?! [transform]
  (transforms.crud/validate-lookback! transform)
  true)

(deftest validate-lookback!-test
  (mt/with-temp [:model/Table {table-id :id}   {}
                 :model/Field {dt-field :id}   {:table_id table-id :base_type :type/DateTime}
                 :model/Field {ts-field :id}   {:table_id table-id :base_type :type/DateTimeWithTZ}
                 :model/Field {date-field :id} {:table_id table-id :base_type :type/Date}
                 :model/Field {time-field :id} {:table_id table-id :base_type :type/Time}
                 :model/Field {num-field :id}  {:table_id table-id :base_type :type/BigInteger}
                 :model/Field {unix-field :id} {:table_id table-id
                                                :base_type :type/BigInteger
                                                :effective_type :type/Instant
                                                :coercion_strategy :Coercion/UNIXSeconds->DateTime}]
    (testing "datetime and timestamp checkpoint columns accept any unit"
      (is (validates?! (lookback-transform dt-field {:value 4 :unit "hour"})))
      (is (validates?! (lookback-transform ts-field {:value 4 :unit "minute"}))))
    (testing "coerced unix-timestamp columns count as temporal via their effective type"
      (is (validates?! (lookback-transform unix-field {:value 4 :unit "day"}))))
    (testing "date-only checkpoint columns require day-or-coarser units"
      (is (validates?! (lookback-transform date-field {:value 4 :unit "day"})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"days or a coarser unit"
           (validates?! (lookback-transform date-field {:value 4 :unit "hour"})))))
    (testing "time-only checkpoint columns are rejected"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"only supported for date or datetime"
           (validates?! (lookback-transform time-field {:value 1 :unit "day"})))))
    (testing "numeric checkpoint columns are rejected"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"only supported for date or datetime"
           (validates?! (lookback-transform num-field {:value 4 :unit "day"})))))
    (testing "no configured lookback is a no-op"
      (is (validates?! (lookback-transform dt-field nil))))))

(deftest root-collection-is-the-real-transforms-collection-test
  (mt/with-premium-features #{:transforms-basic :hosting}
    (testing "GET /api/collection/root?namespace=transforms returns the real root collection"
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (doseq [user [:crowberto :lucky]]
          (testing (str "as " user)
            (let [response (mt/user-http-request user :get 200 "collection/root" :namespace "transforms")]
              (is (= (collections/transforms-root-collection-id) (:id response)))
              (is (true? (:is_root response))))))
        (testing "a user who is neither an admin nor a data analyst cannot see it"
          (mt/user-http-request :rasta :get 403 "collection/root" :namespace "transforms"))))))

(deftest root-collection-listing-visibility-test
  (mt/with-premium-features #{:transforms-basic :hosting}
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (let [root-id (collections/transforms-root-collection-id)]
        (testing "the tree carries the root so the frontend can recognize it by :is_root"
          (let [root (->> (mt/user-http-request :lucky :get 200 "collection/tree" :namespace "transforms")
                          (m/find-first (comp #{root-id} :id)))]
            (is (some? root))
            (is (true? (:is_root root)))))
        (testing "but it is not listed as a child of itself"
          (is (not (contains? (into #{} (map :id)
                                    (:data (mt/user-http-request :lucky :get 200 "collection/root/items"
                                                                 :namespace "transforms"
                                                                 :models "collection")))
                              root-id))))))))
