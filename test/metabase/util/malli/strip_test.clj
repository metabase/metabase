(ns metabase.util.malli.strip-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.util.malli.strip :as mu.strip]))

(deftest ^:parallel strip-test
  (are [schema value expected] (= expected (mu.strip/strip schema value))
    [:map [:a :int]]
    {:a 1, :b 2}
    {:a 1}

    [:map {:closed true} [:a :int] [:b {:optional true} [:map [:c :int]]]]
    {:a 1, :b {:c 2, :d 3}}
    {:a 1, :b {:c 2}}

    [:map {:closed false} [:a :int]]
    {:a 1, :b 2}
    {:a 1, :b 2}

    :map
    {:a 1}
    {:a 1}

    [:map [:a :int] [::mc/default [:map-of :keyword :int]]]
    {:a 1, :b 2}
    {:a 1, :b 2}

    [:maybe [:sequential [:map [:a :int]]]]
    [{:a 1, :b 2} {:a 3}]
    [{:a 1} {:a 3}]

    [:map-of :string [:map [:a :int]]]
    {"k" {:a 1, :b 2}}
    {"k" {:a 1}}

    [:tuple :keyword [:map [:a :int]]]
    [:x {:a 1, :b 2}]
    [:x {:a 1}]))

(deftest ^:parallel or-strips-by-the-matching-branch-test
  (let [schema [:or
                pos-int?
                [:map {:closed true} [:id :int] [:name {:optional true} :string]]
                [:map [:id :int] [:db_id :int]]]]
    (is (= {:id 1, :db_id 2}
           (mu.strip/strip schema {:id 1, :db_id 2, :x 3})))
    (is (= 1 (mu.strip/strip schema 1)))))

(deftest ^:parallel multi-strips-by-the-dispatched-branch-test
  (let [schema [:multi {:dispatch :type}
                [:a [:map [:type :keyword] [:a :int]]]
                [:b [:map [:type :keyword] [:b :int]]]]]
    (is (= {:type :a, :a 1}
           (mu.strip/strip schema {:type :a, :a 1, :b 2})))
    (is (= {:type :b, :b 2}
           (mu.strip/strip schema {:type :b, :a 1, :b 2})))))

(deftest ^:parallel and-keeps-the-keys-of-every-conjunct-test
  (is (= {:a 1, :b 2}
         (mu.strip/strip [:and [:map [:a :int]] [:map [:b :int]] [:fn map?]] {:a 1, :b 2, :c 3})))
  (is (= {:a 1, :c 3}
         (mu.strip/strip [:and [:map [:a :int]] [:map {:closed false} [:b {:optional true} :int]]] {:a 1, :c 3}))))

(deftest ^:parallel identity-and-metadata-test
  (testing "a value that loses nothing is returned as is"
    (let [value {:a [{:b 1}]}]
      (is (identical? value (mu.strip/strip [:map [:a [:vector [:map [:b :int]]]]] value)))))
  (testing "collections keep their metadata"
    (let [value  ^:x [^:y [:raw "sql"] {:a 1, :b 2}]
          result (mu.strip/strip [:tuple [:vector :any] [:map [:a :int]]] value)]
      (is (= [[:raw "sql"] {:a 1}] result))
      (is (= {:x true} (meta result)))
      (is (= {:y true} (meta (first result)))))))

(deftest ^:parallel recursive-schema-test
  (let [schema [:schema {:registry {::node [:map [:id :int] [:children {:optional true} [:vector [:ref ::node]]]]}}
                ::node]]
    (is (= {:id 1, :children [{:id 2}]}
           (mu.strip/strip schema {:id 1, :x 1, :children [{:id 2, :y 2}]})))))
