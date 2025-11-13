(ns metabase-enterprise.library.api-test
  (:require [clojure.test :refer :all]
            [metabase.collections.models.collection :as collection]
            [metabase.test :as mt]
            [toucan2.core :as t2]))

(deftest get-library
  (mt/with-premium-features #{:library}
    (mt/with-discard-model-updates! [:model/Collection]
      ;; move existing library out of the way
      (t2/update! (t2/table-name :model/Collection) :type collection/library-collection-type {:type nil})
      (t2/update! (t2/table-name :model/Collection) :type collection/library-models-collection-type {:type nil})
      (t2/update! (t2/table-name :model/Collection) :type collection/library-metrics-collection-type {:type nil})

      (testing "When there is no library, returns a messsage but still 200"
        (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
          (is (= {:message "Library does not exist"} response))))
      (let [_          (collection/create-library-collection!)
            models-id  (t2/select-one-pk :model/Collection :type collection/library-models-collection-type)
            metrics-id (t2/select-one-pk :model/Collection :type collection/library-metrics-collection-type)
            response   (mt/user-http-request :crowberto :get 200 "ee/library")]
        (testing "When library exists, but no content"
          (is (= "Library" (:name response)))
          (is (= [] (:here response)))
          (is (= [] (:below response))))
        (testing "With content in the library"
          (mt/with-temp [:model/Card _ {:name          "Card in Models"
                                        :collection_id models-id
                                        :type          :model}
                         :model/Card _ {:name          "Card in Metrics"
                                        :collection_id metrics-id
                                        :type          :metric}
                         :model/Card _ {:name          "Other Card in Metrics"
                                        :collection_id metrics-id
                                        :type          :metric}]
            (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
              (is (= "Library" (:name response)))
              (is (= ["dataset" "metric"] (:below response)))
              (is (= [] (:here response))))))))
    (t2/delete! :model/Collection :type [:in [collection/library-collection-type
                                              collection/library-models-collection-type
                                              collection/library-metrics-collection-type]])))

;(mt/with-discard-model-updates! [:model/Collection]
;  (testing "Can create a library if none exist"
;    (t2/update! :model/Collection :type collection/library-collection-type {:type nil})
;    (t2/update! :model/Collection :type collection/library-models-collection-type {:type nil})
;    (t2/update! :model/Collection :type collection/library-metrics-collection-type {:type nil})
;    (let [library (collection/create-library-collection!)]
;      (is (= "Library" (:name library)))
;      (is (= ["Metrics" "Models"] (sort (map :name (collection/descendants library)))))
;      (testing "Only admins can write to the library, all users can read"
;        (binding [api/*current-user*                 (mt/user->id :rasta)
;                  api/*current-user-permissions-set* (-> :rasta mt/user->id perms/user-permissions-set atom)]
;          (is (true? (mi/can-read? library)))
;          (is (false? (mi/can-write? library)))
;          (doseq [sub (collection/descendants library)]
;            (is (true? (mi/can-read? sub)))
;            (is (false? (mi/can-write? sub))))))))
;  (testing "Creating a Layer when one already exists throws an exception"
;    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Library already exists" (collection/create-library-collection!))))
;  ;;cleanup created libraries
;  (t2/delete! :model/Collection :type [:in [collection/library-collection-type
;                                            collection/library-models-collection-type
;                                            collection/library-metrics-collection-type]])))
