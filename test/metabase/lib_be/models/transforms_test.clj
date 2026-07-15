(ns metabase.lib-be.models.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.metadata.bootstrap :as lib-be.bootstrap]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(deftest ^:parallel handle-bad-template-tags-test
  (testing (str "an malformed template tags map like the one below is invalid. Rather than potentially destroy an entire API "
                "response because of one malformed Card, dump the error to the logs and return nil.")
    (is (= {}
           ((:out lib-be/transform-query)
            (json/encode
             {:database 1
              :type     :native
              :native   {:template-tags 1000}}))))))

(deftest ^:parallel template-tag-validate-saves-test
  (testing "on the other hand we should be a little more strict on the way in and disallow you from saving the invalid stuff"
    ;; TODO -- we should make sure this returns a good error message so we don't have to dig thru the exception chain.
    (is (thrown?
         Exception
         ((:in lib-be/transform-query)
          {:database 1
           :type     :native
           :native   {:template-tags {100 [:field-id "WOW"]}}})))))

(deftest ^:parallel normalize-empty-query-test
  (is (= {}
         ((:out lib-be/transform-query) "{}"))))

(deftest ^:parallel normalize-busted-query-test
  (mu/disable-enforcement
    (is (= {}
           (lib-be/normalize-query {:query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-2
  (mu/disable-enforcement
    (is (= {}
           (lib-be/normalize-query {:database 1, :query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-3
  (mu/disable-enforcement
    (is (= {}
           (lib-be/normalize-query {:database 1, :lib/type :mbql/query, :query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-4
  (mu/disable-enforcement
    (is (= {}
           (lib-be/normalize-query {:database 1, :type :query, :stages []})))))

(deftest ^:parallel normalize-busted-query-test-5
  (testing "A totally broken query should get normalized to a map rather than return a string or nil"
    (mu/disable-enforcement
      (is (= {}
             ((:out lib-be/transform-query) "WOW THIS IS A MESSED UP DATASET_QUERY!"))))))

(deftest ^:parallel normalize-invalid-widget-type-test
  (is (=? {:lib/type :mbql/query
           :stages   [{:lib/type :mbql.stage/native
                       :template-tags
                       [{:widget-type  :category
                         :id           "e8b0b767-0f02-b640-5de3-128e7f7fd71e"
                         :name         "device_category"
                         :display-name "Device category"
                         :type         :dimension
                         :dimension    [:field {} 298221]
                         :default      nil}]
                       :native   "<<NATIVE QUERY>>"}]
           :database 26}
          (mu/disable-enforcement
            (lib-be/normalize-query
             {"database" 26
              "type"     "native"
              "native"   {"template-tags"
                          {"device_category" {"id"           "e8b0b767-0f02-b640-5de3-128e7f7fd71e"
                                              "name"         "device_category"
                                              "display-name" "Device category"
                                              "type"         "dimension"
                                              "dimension"    ["field" 298221 nil]
                                              "widget-type"  "category/="
                                              "default"      nil}}
                          "query" "<<NATIVE QUERY>>"}})))))

(deftest transform-query-out-vm-error-propagates-test
  (testing "a VM Error thrown during dataset_query deserialization propagates instead of yielding an empty query"
    (mt/with-dynamic-fn-redefs [mi/json-out-without-keywordization (fn [_] (throw (Error. "boom")))]
      (is (thrown? Error
                   ((:out lib-be/transform-query) "{}")))))
  (testing "an Exception thrown during dataset_query deserialization yields an empty query"
    (mt/with-dynamic-fn-redefs [mi/json-out-without-keywordization (fn [_] (throw (RuntimeException. "boom")))]
      (is (= {}
             ((:out lib-be/transform-query) "{}")))))
  (testing "an AssertionError thrown during dataset_query deserialization is contained, yielding an empty query"
    (mt/with-dynamic-fn-redefs [mi/json-out-without-keywordization (fn [_] (throw (AssertionError. "boom")))]
      (is (= {}
             ((:out lib-be/transform-query) "{}"))))))

(deftest normalize-query-vm-error-propagates-test
  (testing "a VM Error thrown during query normalization propagates instead of yielding an empty query"
    (mt/with-dynamic-fn-redefs [lib-be.bootstrap/resolve-database (fn [& _] (throw (Error. "boom")))]
      (is (thrown? Error
                   (lib-be/normalize-query {:database 1
                                            :type     :query
                                            :query    {:source-table 2}})))))
  (testing "an Exception thrown during query normalization yields an empty query"
    (mt/with-dynamic-fn-redefs [lib-be.bootstrap/resolve-database (fn [& _] (throw (RuntimeException. "boom")))]
      (is (= {}
             (lib-be/normalize-query {:database 1
                                      :type     :query
                                      :query    {:source-table 2}}))))))

(defn- write-read-query [query]
  ((:out lib-be/transform-query) ((:in lib-be/transform-query) query)))

(defn- native-card-tag-query [tag-name tag]
  {:database (mt/id)
   :type     :native
   :native   {:query         (str "SELECT * FROM {{" tag-name "}}")
              :template-tags {tag-name tag}}})

(deftest ^:parallel canonicalize-card-template-tags-test
  (testing "on write, a card tag whose name embeds a different card id than :card-id is rewritten to the id (#77516)"
    (mt/with-temp [:model/Card {card-id :id} {:name "BH Population Model"}]
      (let [stale-name (str "#" (inc card-id) "-bh-population-model")
            new-name   (str "#" card-id "-bh-population-model")]
        (is (=? {:stages [{:native        (str "SELECT * FROM {{" new-name "}}")
                           :template-tags [{:type         :card
                                            :name         new-name
                                            :display-name (u.humanization/name->human-readable-name :simple new-name)
                                            :card-id      card-id}]}]}
                (write-read-query
                 (native-card-tag-query stale-name
                                        {:id           "5ebf6c2e-d6e2-449e-97b7-7005047928e5"
                                         :name         stale-name
                                         :display-name (u.humanization/name->human-readable-name :simple stale-name)
                                         :type         :card
                                         :card-id      card-id}))))))))

(deftest ^:parallel canonicalize-card-template-tags-slug-drift-test
  (testing "a card tag whose name agrees with :card-id but has a stale slug is canonicalized to the card's current name"
    (mt/with-temp [:model/Card {card-id :id} {:name "Totally Different Name"}]
      (let [tag-name (str "#" card-id "-some-old-slug")
            new-name (str "#" card-id "-totally-different-name")]
        (is (=? {:stages [{:native        (str "SELECT * FROM {{" new-name "}}")
                           :template-tags [{:name new-name, :card-id card-id}]}]}
                (write-read-query
                 (native-card-tag-query tag-name
                                        {:id           "5ebf6c2e-d6e2-449e-97b7-7005047928e5"
                                         :name         tag-name
                                         :display-name "Some Old Slug"
                                         :type         :card
                                         :card-id      card-id}))))))))

(deftest ^:parallel canonicalize-card-template-tags-missing-card-test
  (testing "a tag whose :card-id doesn't resolve to a card is untouched"
    (let [missing-id 2147483647
          tag-name   "#133-who-knows"]
      (is (=? {:stages [{:native        (str "SELECT * FROM {{" tag-name "}}")
                         :template-tags [{:name tag-name, :card-id missing-id}]}]}
              (write-read-query
               (native-card-tag-query tag-name
                                      {:id           "5ebf6c2e-d6e2-449e-97b7-7005047928e5"
                                       :name         tag-name
                                       :display-name "Who Knows"
                                       :type         :card
                                       :card-id      missing-id})))))))
