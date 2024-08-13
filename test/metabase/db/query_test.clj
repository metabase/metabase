(ns metabase.db.query-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.query :as mdb.query]
   [metabase.models.setting :refer [Setting]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(defn- verify-same-query
  "Ensure that the formatted native query derived from an mbql query produce the same results."
  [q]
  (let [{:keys [query]} (qp.compile/compile q)
        formatted-query (mdb.query/format-sql query)
        native-query    {:database (mt/id)
                         :type     :native
                         :native   {:query formatted-query}}]
    (testing "The generated query and formatted query should be substantially identical"
      (is (= (str/replace query #"(?s)\s+" "") (str/replace formatted-query #"(?s)\s+" ""))))
    (testing "The results of the query should be identical"
      (is (= (-> (qp/process-query q) :data :rows)
             (-> (qp/process-query native-query) :data :rows))))))

(deftest ensure-same-queries-test
  (testing "A test with several joins and an aggregate should produce the same result in mbql or the derived native sql"
    (mt/dataset test-data
      (let [q {:type     :query
               :query    (mt/$ids
                          {:source-table (mt/id :orders)
                           :joins        [{:fields       [[:field (mt/id :people :latitude) {:join-alias "People - User"}]
                                                          [:field (mt/id :people :longitude) {:join-alias "People - User"}]
                                                          [:field (mt/id :people :state) {:join-alias "People - User"}]]
                                           :source-table (mt/id :people)
                                           :condition    [:=
                                                          [:field (mt/id :orders :user_id) nil]
                                                          [:field (mt/id :people :id) {:join-alias "People - User"}]]
                                           :alias        "People - User"}
                                          {:fields       [[:field (mt/id :products :rating) {:join-alias "Products"}]
                                                          [:field (mt/id :products :price) {:join-alias "Products"}]]
                                           :source-table (mt/id :products)
                                           :condition    [:=
                                                          [:field (mt/id :orders :product_id) nil]
                                                          [:field (mt/id :products :id) {:join-alias "Products"}]]
                                           :alias        "Products"}]
                           :filter       [:>= [:field (mt/id :products :rating) {:join-alias "Products"}] 3]
                           :aggregation  [[:count]]
                           :breakout     [[:field (mt/id :people :source) {:join-alias "People - User"}]]})
               :database (mt/id)}]
        (verify-same-query q))))
  (testing "A test with several joins a custom column, and an aggregate should produce the same result in mbql or the derived native sql"
    (mt/dataset test-data
      (let [q {:type     :query
               :query    (mt/$ids
                          {:source-table (mt/id :orders)
                           :joins        [{:fields       [[:field (mt/id :people :latitude) {:join-alias "People - User"}]
                                                          [:field (mt/id :people :longitude) {:join-alias "People - User"}]
                                                          [:field (mt/id :people :state) {:join-alias "People - User"}]]
                                           :source-table (mt/id :people)
                                           :condition    [:=
                                                          [:field (mt/id :orders :user_id) nil]
                                                          [:field (mt/id :people :id) {:join-alias "People - User"}]]
                                           :alias        "People - User"}
                                          {:fields       [[:field (mt/id :products :rating) {:join-alias "Products"}]
                                                          [:field (mt/id :products :price) {:join-alias "Products"}]]
                                           :source-table (mt/id :products)
                                           :condition    [:=
                                                          [:field (mt/id :orders :product_id) nil]
                                                          [:field (mt/id :products :id) {:join-alias "Products"}]]
                                           :alias        "Products"}]
                           :expressions  {"Price per Star" [:/
                                                            [:field (mt/id :products :price) {:join-alias "Products"}]
                                                            [:field (mt/id :products :rating) {:join-alias "Products"}]]}
                           :aggregation  [[:avg [:expression "Price per Star"]]],
                           :breakout     [[:field (mt/id :products :category) {:join-alias "Products"}]]})
               :database (mt/id)}]
        (verify-same-query q)))))


(deftest select-or-insert!-test
  ;; We test both a case where the database protects against duplicates, and where it does not.
  ;; Using Setting is perfect because it has only two required fields - (the primary) key & value (with no constraint).
  ;;
  ;; In the `:key` case using the `idempotent-insert!` rather than an `or` prevents the from application throwing an
  ;; exception when there are race conditions. For `:value` it prevents us silently inserting duplicates.
  ;;
  ;; It's important to test both, as only the latter has a phantom read issue and thus requires serializable isolation.
  (let [columns [:key :value]]
    (doseq [search-col columns]
      (testing (format "When the search column %s a uniqueness constraint in the db"
                       (if (= :key search-col) "has" "does not have"))
        (let [search-value   (str (random-uuid))
              other-col      (first (remove #{search-col} columns))]
          (try
            ;; ensure there is no database detritus to trip us up
            (t2/delete! Setting search-col search-value)

            (let [threads 5
                  latch   (CountDownLatch. threads)
                  thunk   (fn []
                            (mdb.query/select-or-insert! Setting {search-col search-value}
                                                         (fn []
                                                           ;; Make sure all the threads are in the mutating path
                                                           (.countDown latch)
                                                           (.await latch)
                                                           {other-col (str (random-uuid))})))
                  results (set (mt/repeat-concurrently threads thunk))
                  n       (count results)
                  latest  (t2/select-one Setting search-col search-value)]

              (case search-col
                :key
                (do (testing "every call returns the same row"
                      (is (= #{latest} results)))

                    (testing "we never insert any duplicates"
                      (is (= 1 (t2/count Setting search-col search-value))))

                    (testing "later calls just return the existing row as well"
                      (is (= latest (thunk)))
                      (is (= 1 (t2/count Setting search-col search-value)))))

                :value
                (do
                  (testing "there may be race conditions, but we insert at least once"
                    (is (pos? n)))

                  (testing "we returned the same values that were inserted into the database"
                    (is (= results (set (t2/select Setting search-col search-value)))))

                  (testing "later calls just return an existing row as well"
                    (is (contains? results (thunk)))
                    (is (= results (set (t2/select Setting search-col search-value))))))))

            ;; Since we couldn't use with-temp, we need to clean up manually.
            (finally
              (t2/delete! Setting search-col search-value))))))))

(deftest updated-or-insert!-test
  ;; We test both a case where the database protects against duplicates, and where it does not.
  ;; Using Setting is perfect because it has only two required fields - (the primary) key & value (with no constraint).
  (let [columns [:key :value]]
    (doseq [search-col columns]
      (testing (format "When the search column %s a uniqueness constraint in the db"
                       (if (= :key search-col) "has" "does not have"))
        (doseq [already-exists? [true false]]
          (let [search-value (str (random-uuid))
                other-col    (first (remove #{search-col} columns))
                other-value  (str (random-uuid))]
            (try
              ;; ensure there is no database detritus to trip us up
              (t2/delete! Setting search-col search-value)

              (when already-exists?
                (t2/insert! Setting search-col search-value other-col other-value))

              (let [threads    5
                    latch      (CountDownLatch. threads)
                    thunk      (fn []
                                 (u/prog1 (str (random-uuid))
                                   (mdb.query/update-or-insert! Setting {search-col search-value}
                                                                (fn [_]
                                                                  ;; Make sure all the threads are in the mutating path
                                                                  (.countDown latch)
                                                                  (.await latch)
                                                                  {other-col <>}))))
                    values-set (set (mt/repeat-concurrently threads thunk))
                    latest     (get (t2/select-one Setting search-col search-value) other-col)]

                (testing "each update tried to set a different value"
                  (is (= threads (count values-set))))

                ;; Unfortunately updates are not serialized, but we cannot show that without using a model with more
                ;; than 2 fields.
                (testing "the row is updated to match the last update call that resolved"
                  (is (not= other-value latest))
                  (is (contains? values-set latest)))

                (when (or (= :key search-col) already-exists?)
                  (is (= 1 (count (t2/select Setting search-col search-value)))))

                (testing "After the database is created, it does not create further duplicates"
                  (let [count (t2/count Setting search-col search-value)]
                    (is (pos? count))
                    (is (empty? (set/intersection values-set (set (mt/repeat-concurrently threads thunk)))))
                    (is (= count (t2/count Setting search-col search-value))))))

              ;; Since we couldn't use with-temp, we need to clean up manually.
              (finally
                (t2/delete! Setting search-col search-value)))))))))
