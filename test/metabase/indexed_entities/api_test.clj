(ns metabase.indexed-entities.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.util :as u]))

(deftest full-lifecycle-test
  (mt/dataset test-data
    (let [mp        (mt/metadata-provider)
          query     (lib/query mp (lib.metadata/table mp (mt/id :products)))
          pk_ref    (mt/$ids $products.id)
          value_ref (mt/$ids $products.title)]
      (mt/with-temp [:model/Card model (assoc (mt/card-with-source-metadata-for-query query)
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

(defn by-name [model field]
  (or (some (fn [f] (when (= field (-> f :name u/lower-case-en))
                      [:field {} (:id f)]))
            (:result_metadata model))
      (throw (ex-info (str "Didn't find field: " field)
                      {:fields (map :name (:result_metadata model))
                       :field  field}))))

(deftest create-tests
  (testing "Ensures that the pk ref is a primary key"
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)
            query (lib/query mp (lib.metadata/table mp (mt/id :products)))]
        (mt/with-temp [:model/Card model (assoc (mt/card-with-source-metadata-for-query query)
                                                :type :model
                                                :name "model index test")]
          (doseq [bad-pk-ref [(by-name model "title") (by-name model "created_at")]]
            (let [response (mt/user-http-request :rasta :post 400 "/model-index"
                                                 {:model_id  (:id model)
                                                  :pk_ref    bad-pk-ref ;; invalid pk
                                                  :value_ref (by-name model "title")})]
              (is (=? {:cause "Field is not of :semantic_type `:type/PK`"
                       :data  {:expected-type "type/PK"}}
                      response))))
          (doseq [bad-value-ref [(by-name model "id")
                                 (by-name model "price")
                                 (by-name model "created_at")]]
            (let [response (mt/user-http-request :rasta :post 400 "/model-index"
                                                 {:model_id  (:id model)
                                                  :pk_ref    (by-name model "id")
                                                  :value_ref bad-value-ref})]
              (is (=? {:cause "Field is not of :effective_type `:type/Text`"
                       :data  {:expected-type "type/Text"}}
                      response))))
          (let [not-in-query (mt/$ids $people.email)
                response (mt/user-http-request :rasta :post 400 "/model-index"
                                               {:model_id  (:id model)
                                                :pk_ref    (by-name model "id")
                                                :value_ref not-in-query})]
            (is (=? {:cause #"Could not identify field by ref.*"}
                    response))))))))

(deftest snowplow-create-model-index-event-test
  (testing "Send a snowplow event when “Surface individual records matching against column” is toggled on (and saved)"
    (snowplow-test/with-fake-snowplow-collector
      (mt/dataset test-data
        (let [mp        (mt/metadata-provider)
              query     (lib/query mp (lib.metadata/table mp (mt/id :products)))
              pk_ref    (mt/$ids $products.id)
              value_ref (mt/$ids $products.title)]
          (mt/with-temp [:model/Card model (assoc (mt/card-with-source-metadata-for-query query)
                                                  :type :model
                                                  :name "model index test")]
            (mt/user-http-request :crowberto :post 200 "/model-index" {:model_id  (:id model)
                                                                       :pk_ref    pk_ref
                                                                       :value_ref value_ref})
            (is (=? {:data {"event"    "index_model_entities_enabled"
                            "model_id" (:id model)}
                     :user-id (str (mt/user->id :crowberto))}
                    (last (snowplow-test/pop-event-data-and-user-id!))))))))))
