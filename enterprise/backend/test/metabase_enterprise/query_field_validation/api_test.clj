(ns metabase-enterprise.query-field-validation.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as hawk.approx]
   [metabase.query-analysis :as query-analysis]
   [metabase.test :as mt]
   [ring.util.codec :as codec]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- do-with-test-setup [f]
  (query-analysis/without-analysis
   (t2.with-temp/with-temp [:model/Table      {table  :id}   {:name "T"}
                            ;; no coll-1; its card is in the root collection
                            :model/Collection {coll-2 :id}   {:name "ZZY"}
                            :model/Collection {coll-3 :id}   {:name "ZZZ"}
                            :model/Card       {card-1 :id}   {:name "A"}
                            :model/Card       {card-2 :id}   {:name "B" :collection_id coll-2}
                            :model/Card       {card-3 :id}   {:name "C" :collection_id coll-3}
                            :model/Card       {card-4 :id}   {:name "D"}
                            :model/Field      {field-1 :id}  {:active   false
                                                              :name     "FA"
                                                              :table_id table}
                            :model/Field      {field-1b :id} {:active   false
                                                              :name     "FAB"
                                                              :table_id table}
                            :model/Field      {field-2 :id}  {:active   false
                                                              :name     "FB"
                                                              :table_id table}
                            :model/Field      {field-3 :id}  {:active   false
                                                              :name     "FC"
                                                              :table_id table}
                            ;; QFs not to include:
                            ;; - Field is still active
                            :model/QueryField {}             {:card_id  card-1
                                                              :field_id (mt/id :orders :tax)}
                            ;; - Implicit reference
                            :model/QueryField {}             {:card_id            card-2
                                                              :field_id           field-1
                                                              :explicit_reference false}
                            ;; QFs to include:
                            :model/QueryField {qf-1 :id}     {:card_id  card-1
                                                              :field_id field-1}
                            :model/QueryField {qf-1b :id}    {:card_id  card-1
                                                              :field_id field-1b}
                            :model/QueryField {qf-2 :id}     {:card_id  card-2
                                                              :field_id field-2}
                            :model/QueryField {qf-3 :id}     {:card_id  card-3
                                                              :field_id field-3}]
     (mt/with-premium-features #{:query-field-validation}
       (mt/call-with-map-params f [card-1 card-2 card-3 card-4 qf-1 qf-1b qf-2 qf-3])))))

(defmacro ^:private with-test-setup
  "Creates some non-stale QueryFields and anaphorically provides stale QueryField IDs called `qf-{1-3}` and `qf-1b` and
  their corresponding Card IDs (`card-{1-3}`). The cards are named A, B, and C. The Fields are called FA, FB, FB and
  they all point to a Table called T. Both `qf-1` and `qf-1b` refer to `card-1`.

  `card-4` is guaranteed not to have problems"
  [& body]
  `(do-with-test-setup
    (mt/with-anaphora [qf-1 qf-1b qf-2 qf-3 card-1 card-2 card-3 card-4]
      ~@body)))

(def ^:private url "ee/query-field-validation/invalid-cards")

(defn- get!
  ([] (get! {}))
  ([params]
   (mt/user-http-request :crowberto :get 200 (str url "?" (codec/form-encode params)))))

(defn- approx=
  [expected actual]
  (nil? (hawk.approx/=?-diff expected actual)))

(defn- none-found?
  [blacklist actual]
  (empty? (for [b blacklist
                a actual
                :when (approx= b a)]
            :found)))

(defn- resp=
  "Is the response close enough to what we expect? Accounts for extra data from the app DB that could sneak in. If
  `unexpected` is provided, ensure that they're *not* present.

  Due to pagination this is slightly fragile, sorry."
  ([expected actual]
   (resp= expected actual nil))
  ([expected actual unexpected]
   ;; CI is swallowing 500 errors; here's a cheeky way to surface them
   (is (empty? (filter some? ((juxt :via :trace) actual))))
   (is (<= (:total expected)  (:total actual)))
   (is (=  (:limit expected)  (:limit actual)))
   (is (=  (:offset expected) (:offset actual)))
   (is (some? (:data actual)))
   (is (mt/ordered-subset? (:data expected)
                           (map #(select-keys % (keys (first (:data expected)))) (:data actual)) approx=))
   (is (none-found? unexpected (:data actual)))))

(deftest list-invalid-cards-basic-test
  (testing "Only returns cards with problematic field refs"
    (with-test-setup
      (resp= {:total 3,
              :data
              [{:id     card-1
                :name   "A"
                :errors {:inactive-fields [{:field "FA"
                                            :table "T"}
                                           {:field "FAB"
                                            :table "T"}]}}
               {:id     card-2
                :name   "B"
                :errors {:inactive-fields [{:field "FB"
                                            :table "T"}]}}
               {:id     card-3
                :name   "C"
                :errors {:inactive-fields [{:field "FC"
                                            :table "T"}]}}]}
             (get!)
             [{:id   card-4
               :name "D"}])))
  (testing "It requires the premium feature"
    (mt/with-premium-features #{}
      (is (= "Query Field Validation is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
             (mt/user-http-request :crowberto :get 402 url))))))

(deftest pagination-test
  (testing "Lets you page results"
    (with-test-setup
      (resp= {:total  3
              :limit  2
              :offset 0
              :data
              [{:id     card-1
                :name   "A"
                :errors {:inactive-fields [{:field "FA"
                                            :table "T"}
                                           {:field "FAB"
                                            :table "T"}]}}
               {:id     card-2
                :name   "B"
                :errors {:inactive-fields [{:field "FB"
                                            :table "T"}]}}]}
             (get! {:limit 2})
             [{:id   card-3
               :name "C"}
              {:id   card-4
               :name "D"}])
      (resp= {:total  3
              :limit  1
              :offset 2
              :data
              [{:id     card-3
                :name   "C"
                :errors {:inactive-fields [{:field "FC"
                                            :table "T"}]}}]}
             (get! {:limit 1 :offset 2})
             [{:id   card-1
               :name "A"}
              {:id   card-2
               :name "B"}
              {:id   card-4
               :name "D"}]))))

(deftest sorting-test
  (testing "Lets you specify the sort key"
    (with-test-setup
      (resp= {:total 3
              :data
              [{:id card-3}
               {:id card-2}
               {:id card-1}]}
             (get! {:sort_column "collection" :sort_direction "desc"}))
      (resp= {:total 3
              :data
              [{:id card-1}
               {:id card-2}
               {:id card-3}]}
             (get! {:sort_column "last_edited_at" :sort_direction "asc"}))
      (resp= {:total 3
              :data
              [{:id card-3}
               {:id card-2}
               {:id card-1}]}
             (get! {:sort_column "last_edited_at" :sort_direction "desc"}))))
  (testing "Rejects bad keys"
    (with-test-setup
      (is (str/starts-with? (:sort_column
                             (:errors
                              (mt/user-http-request :crowberto :get 400 (str url "?sort_column=favorite_bird"))))
                            "nullable enum of")))))

(deftest is-admin-test
  (mt/with-premium-features #{:query-field-validation}
    (testing "The endpoint is unavailable for normal users"
      (is (mt/user-http-request :rasta :get 403 url)))))
