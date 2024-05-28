(ns metabase-enterprise.content-management.api.collection-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest create-official-collection-test
  (testing "POST /api/collection/:id"
    (testing "when :official-collections is enabled "
      (mt/with-premium-features #{:official-collections}
        (testing "Admins can add an official collection"
          (mt/with-model-cleanup [:model/Collection]
            (let [resp (mt/user-http-request :crowberto :post 200 "collection" {:name            "An official collection"
                                                                                :authority_level "official"})]
              (is (malli= [:map
                           [:description       :nil]
                           [:archived          [:= false]]
                           [:slug              [:= "an_official_collection"]]
                           [:name              [:= "An official collection"]]
                           [:personal_owner_id :nil]
                           [:authority_level   [:= "official"]]
                           [:id                :int]
                           [:location          [:= "/"]]
                           [:entity_id         [:maybe ms/NanoIdString]]
                           [:namespace         :nil]
                           [:created_at        [:fn
                                                {:error/message "instance of java.time.temporal.Temporal"}
                                                (partial instance? java.time.temporal.Temporal)]]
                           [:type              [:maybe :string]]]
                          resp))
              (is (= :official (t2/select-one-fn :authority_level :model/Collection (:id resp))))))

          (testing "but the type has to be valid"
            (mt/user-http-request :crowberto :post 400 "collection"
                                  {:name "foo" :authority_level "invalid-type"})))

        (testing "non-admins get 403"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "collection" {:name            "An official collection"
                                                                      :authority_level "official"}))))))

    (testing "fails to add an official collection if doesn't have any premium features"
      (mt/with-premium-features #{}
        (is (= "Official Collections is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
               (mt/user-http-request :crowberto :post 402 "collection" {:name            "An official collection"
                                                                        :authority_level "official"})))))))

(deftest update-collection-authority-happy-path-test
  (testing "PUT /api/collection/:id"
    (testing "update authority_level when has :official-collections feature"
      (mt/with-premium-features #{:official-collections}
        (testing "requires admin"
          (t2.with-temp/with-temp
            [:model/Collection {id :id} {:authority_level nil}]
            (is (= "official"
                   (:authority_level (mt/user-http-request :crowberto :put 200 (format "collection/%d" id) {:authority_level "official"}))))
            (is (= :official (t2/select-one-fn :authority_level :model/Collection id)))))

        (testing "Non-admins can patch without the :authority_level"
          (t2.with-temp/with-temp [:model/Collection collection {:name "whatever" :authority_level "official"}]
            (is (= "official"
                   (-> (mt/user-http-request :rasta :put 200 (str "collection/" (:id collection))
                                             {:name "foo"})
                       :authority_level)))))

        (testing "non-admins get 403"
          (t2.with-temp/with-temp
            [:model/Collection {id :id} {:authority_level nil}]
            (is (= "official"
                   (:authority_level (mt/user-http-request :crowberto :put 200 (format "collection/%d" id) {:authority_level "official"}))))
            (is (= :official (t2/select-one-fn :authority_level :model/Collection id)))))))

    (testing "fails to update if doesn't have any premium features"
      (mt/with-premium-features #{}
        (t2.with-temp/with-temp
          [:model/Collection {id :id} {:authority_level nil}]
          (is (= "Official Collections is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request :crowberto :put 402 (format "collection/%d" id) {:authority_level "official"}))))))))


(deftest update-collection-authority-backward-compatible-test
  ;; edge cases we need to handle for backwards compatibility see metabase-private#77
  (testing "backwards-compatible check when doesn't have :official-collections feature\n"
    (mt/with-premium-features #{}
      (testing "authority_level already set and update payload contains the key but does not change"
        (t2.with-temp/with-temp
          [:model/Collection {id :id} {:authority_level "official"}]
          (mt/user-http-request :crowberto :put 200 (format "collection/%d" id) {:authority_level "official" :name "New name"})
          (is (= "New name" (t2/select-one-fn :name :model/Collection id)))))

      (testing "authority_level is not set and update payload contains the key but does not change"
        (t2.with-temp/with-temp
          [:model/Collection {id :id} {}]
          (mt/user-http-request :crowberto :put 200 (format "collection/%d" id) {:authority_level nil :name "New name"})
          (is (= "New name" (t2/select-one-fn :name :model/Collection id))))))))

(deftest moderation-review-test
  (t2.with-temp/with-temp
    [:model/Card {card-id :id} {:name "A question"}
     :model/Card {model-id :id} {:name "A question" :type :model}]
    (testing "can't use verified questions/models if has :official-collections feature"
      (mt/with-premium-features #{:official-collections}
        (is (= "Content verification is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
               (mt/user-http-request :crowberto :post 402 "moderation-review"
                                     {:moderated_item_id   card-id
                                      :moderated_item_type :card
                                      :status              :verified})))
        (is (= "Content verification is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
               (mt/user-http-request :crowberto :post 402 "moderation-review"
                                     {:moderated_item_id   model-id
                                      :moderated_item_type :card
                                      :status              :verified})))))

    (testing "can use verified questions/models if has :content-verification feature"
      (mt/with-premium-features #{:content-verification}
        (is (pos-int? (:id (mt/user-http-request :crowberto :post 200 "moderation-review"
                                                 {:moderated_item_id   card-id
                                                  :moderated_item_type :card
                                                  :status              :verified}))))
        (is (pos-int? (:id (mt/user-http-request :crowberto :post 200 "moderation-review"
                                                 {:moderated_item_id   model-id
                                                  :moderated_item_type :card
                                                  :status              :verified}))))))))
