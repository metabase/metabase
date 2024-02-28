(ns metabase.api.model-index-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.models.card :refer [Card]]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]
   [toucan2.util :as u]))

(deftest full-lifecycle-test
  (mt/dataset test-data
    (let [query     (mt/mbql-query products)
          pk_ref    (mt/$ids $products.id)
          value_ref (mt/$ids $products.title)]
      (t2.with-temp/with-temp [Card model (assoc (mt/card-with-source-metadata-for-query query)
                                                 :type :model
                                                 :name "model index test")]
        (let [model-index (mt/user-http-request :rasta :post 200 "/model-index"
                                                {:model_id  (:id model)
                                                 :pk_ref    pk_ref
                                                 :value_ref value_ref})]
          (testing "POST"
            (is (=? {:state      "indexed"
                     :model_id   (:id model)
                     :error      nil}
                    model-index))
            (testing "Need write access to post"
              (mt/with-non-admin-groups-no-root-collection-perms
                (mt/user-http-request :rasta :post 403 "/model-index"
                                      {:model_id  (:id model)
                                       :pk_ref    pk_ref
                                       :value_ref value_ref}))))
          (testing "GET by model id"
            (is (=? [{:state      "indexed"
                      :model_id   (:id model)
                      :error      nil}]
                    (mt/user-http-request :rasta :get 200 "model-index"
                                          :model_id (:id model))))
            (testing "Checks model permissions"
              (mt/with-non-admin-groups-no-root-collection-perms
                (mt/user-http-request :rasta :get 403 "model-index"
                                      :model_id (:id model)))))
          (testing "GET by model-index id"
            (is (=? {:state      "indexed"
                     :model_id   (:id model)
                     :error      nil}
                    (mt/user-http-request :rasta :get 200
                                          (str "/model-index/" (:id model-index)))))
            (testing "Checks model permissions"
              (mt/with-non-admin-groups-no-root-collection-perms
                (mt/user-http-request :rasta :get 403
                                      (str "/model-index/" (:id model-index))))))

          (testing "DELETE"
            (testing "Must have write access to the underlying model"
              (mt/with-non-admin-groups-no-root-collection-perms
                (mt/user-http-request :rasta :delete 403
                                      (str "model-index/" (:id model-index)))))
            (mt/user-http-request :rasta :delete 200 (str "model-index/" (:id model-index)))))))))

(deftest create-tests
  (testing "Ensures that the pk ref is a primary key"
    (mt/dataset test-data
      (let [query (mt/mbql-query products)]
        (t2.with-temp/with-temp [Card model (assoc (mt/card-with-source-metadata-for-query query)
                                                   :type :model
                                                   :name "model index test")]
          (let [by-name (fn [n] (or (some (fn [f] (when (= n (-> f :name u/lower-case-en))
                                                    (:field_ref f)))
                                          (:result_metadata model))
                                    (throw (ex-info (str "Didn't find field: " n)
                                                    {:fields (map :name (:result_metadata model))
                                                     :field  n}))))]
            (doseq [bad-pk-ref [(by-name "title") (by-name "created_at")]]
              (let [response (mt/user-http-request :rasta :post 400 "/model-index"
                                                   {:model_id  (:id model)
                                                    :pk_ref    bad-pk-ref ;; invalid pk
                                                    :value_ref (by-name "title")})]
                (is (=? {:cause "Field is not of :semantic_type `:type/PK`"
                         :data  {:expected-type "type/PK"}}
                        response))))
            (doseq [bad-value-ref [(by-name "id") (by-name "price") (by-name "created_at")]]
              (let [response (mt/user-http-request :rasta :post 400 "/model-index"
                                                   {:model_id  (:id model)
                                                    :pk_ref    (by-name "id")
                                                    :value_ref bad-value-ref})]
                (is (=? {:cause "Field is not of :effective_type `:type/Text`"
                         :data  {:expected-type "type/Text"}}
                        response))))
            (let [not-in-query (mt/$ids $people.email)]
              (let [response (mt/user-http-request :rasta :post 400 "/model-index"
                                                   {:model_id  (:id model)
                                                    :pk_ref    (by-name "id")
                                                    :value_ref not-in-query})]
                (is (=? {:cause #"Could not identify field by ref.*"}
                        response))))))))))

(deftest snowplow-create-model-index-event-test
  (testing "Send a snowplow event when “Surface individual records matching against column” is toggled on (and saved)"
    (snowplow-test/with-fake-snowplow-collector
      (mt/dataset test-data
        (let [query     (mt/mbql-query products)
              pk_ref    (mt/$ids $products.id)
              value_ref (mt/$ids $products.title)]
          (t2.with-temp/with-temp [Card model (assoc (mt/card-with-source-metadata-for-query query)
                                                     :type :model
                                                     :name "model index test")]
            (mt/user-http-request :crowberto :post 200 "/model-index" {:model_id  (:id model)
                                                                       :pk_ref    pk_ref
                                                                       :value_ref value_ref})
            (is (=? {:data {"event"    "index_model_entities_enabled"
                            "model_id" (:id model)}
                     :user-id (str (mt/user->id :crowberto))}
                    (last (snowplow-test/pop-event-data-and-user-id!))))))))))
