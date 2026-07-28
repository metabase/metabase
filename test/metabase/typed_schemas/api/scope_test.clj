(ns metabase.typed-schemas.api.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.api.scope :as typed-schemas.api.scope]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest library-collection-scope-accepts-subcollection-id-test
  (mt/with-temp [:model/Collection root  {:name "Library"
                                          :type "library"
                                          :location "/"}
                 :model/Collection data  {:name "Data"
                                          :type "library-data"
                                          :location (collection/children-location root)}
                 :model/Collection child {:name "Boba Data"
                                          :type "library-data"
                                          :location (collection/children-location data)}]
    (mt/with-test-user :crowberto
      (is (= {:collection-ids        #{(:id child)}
              :data-collection-ids   #{(:id child)}
              :metric-collection-ids #{}}
             (select-keys (#'typed-schemas.api.scope/library-collection-scope (str (:id child)))
                          [:collection-ids :data-collection-ids :metric-collection-ids]))))))

(deftest library-collections-scope-accepts-comma-separated-subcollection-ids-test
  (mt/with-temp [:model/Collection root          {:name "Library"
                                                  :type "library"
                                                  :location "/"}
                 :model/Collection data          {:name "Data"
                                                  :type "library-data"
                                                  :location (collection/children-location root)}
                 :model/Collection metrics       {:name "Metrics"
                                                  :type "library-metrics"
                                                  :location (collection/children-location root)}
                 :model/Collection data-child    {:name "Boba Data"
                                                  :type "library-data"
                                                  :location (collection/children-location data)}
                 :model/Collection data-grandkid {:name "Boba Data Nested"
                                                  :type "library-data"
                                                  :location (collection/children-location data-child)}
                 :model/Collection metric-child  {:name "Boba Metrics"
                                                  :type "library-metrics"
                                                  :location (collection/children-location metrics)}]
    (mt/with-test-user :crowberto
      (is (= {:collection-ids        #{(:id data-child) (:id data-grandkid) (:id metric-child)}
              :data-collection-ids   #{(:id data-child) (:id data-grandkid)}
              :metric-collection-ids #{(:id metric-child)}}
             (select-keys (#'typed-schemas.api.scope/library-collections-scope
                           (#'typed-schemas.api.scope/query-library-collection-values
                            {:library-collections (format "%d, %d"
                                                          (:id data-child)
                                                          (:id metric-child))}))
                          [:collection-ids :data-collection-ids :metric-collection-ids]))))))

(deftest library-collections-scope-accepts-representation-entity-ids-test
  (mt/with-temp [:model/Collection root         {:name "Library"
                                                 :type "library"
                                                 :location "/"}
                 :model/Collection data         {:name "Data"
                                                 :type "library-data"
                                                 :location (collection/children-location root)}
                 :model/Collection website      {:name      "Website"
                                                 :type      "library-data"
                                                 :entity_id "g-jLnamuHKdezZMthJ-z7"
                                                 :location  (collection/children-location data)}
                 :model/Collection website-page {:name "Website Page"
                                                 :type "library-data"
                                                 :location (collection/children-location website)}]
    (mt/with-test-user :crowberto
      (is (= {:collection-ids        #{(:id website) (:id website-page)}
              :data-collection-ids   #{(:id website) (:id website-page)}
              :metric-collection-ids #{}}
             (select-keys (#'typed-schemas.api.scope/library-collections-scope ["g-jLnamuHKdezZMthJ-z7"])
                          [:collection-ids :data-collection-ids :metric-collection-ids]))))))

(deftest library-scope-includes-canonical-data-and-metrics-libraries-test
  (with-redefs [typed-schemas.api.scope/library-data-entity-id    "test-library-data"
                typed-schemas.api.scope/library-metrics-entity-id "test-library-metrics"]
    (mt/with-temp [:model/Collection root         {:name "Library"
                                                   :type "library"
                                                   :location "/"}
                   :model/Collection data         {:name      "Data"
                                                   :type      "library-data"
                                                   :entity_id "test-library-data"
                                                   :location  (collection/children-location root)}
                   :model/Collection metrics      {:name      "Metrics"
                                                   :type      "library-metrics"
                                                   :entity_id "test-library-metrics"
                                                   :location  (collection/children-location root)}
                   :model/Collection data-child   {:name "Boba Data"
                                                   :type "library-data"
                                                   :location (collection/children-location data)}
                   :model/Collection metric-child {:name "Boba Metrics"
                                                   :type "library-metrics"
                                                   :location (collection/children-location metrics)}]
      (mt/with-test-user :crowberto
        (is (= {:collection-ids        #{(:id data) (:id data-child) (:id metrics) (:id metric-child)}
                :data-collection-ids   #{(:id data) (:id data-child)}
                :metric-collection-ids #{(:id metrics) (:id metric-child)}}
               (select-keys (#'typed-schemas.api.scope/library-scope
                             {:include-data-library   "true"
                              :include-metric-library "true"})
                            [:collection-ids :data-collection-ids :metric-collection-ids])))))))

(deftest ^:parallel query-collection-values-use-kebab-case-params-test
  (is (= ["1" "2"]
         (#'typed-schemas.api.scope/query-library-collection-values {:library-collections "1, 2"})))
  (is (= ["3" "4"]
         (#'typed-schemas.api.scope/query-question-collection-values {:question-collections "3, 4"})))
  (is (true?
       (#'typed-schemas.api.scope/query-include-models? {:include-models "true"})))
  (is (nil?
       (#'typed-schemas.api.scope/query-library-collection-values {:libraryCollections "1, 2"})))
  (is (nil?
       (#'typed-schemas.api.scope/query-question-collection-values {:questionCollections "3, 4"})))
  (is (false?
       (#'typed-schemas.api.scope/query-include-models? {:includeModels "true"}))))

(deftest question-collection-scope-accepts-comma-separated-collection-ids-test
  (mt/with-temp [:model/Collection parent {:name "Question Parent"
                                           :location "/"}
                 :model/Collection child  {:name "Question Child"
                                           :location (collection/children-location parent)}]
    (mt/with-test-user :crowberto
      (is (= #{(:id parent) (:id child)}
             (#'typed-schemas.api.scope/collection-scope
              (#'typed-schemas.api.scope/query-question-collection-values
               {:question-collections (str (:id parent))})))))))

(deftest question-collection-scope-accepts-representation-entity-ids-test
  (mt/with-temp [:model/Collection parent {:name      "Question Parent"
                                           :entity_id "question-entity-id-1"
                                           :location  "/"}
                 :model/Collection child  {:name "Question Child"
                                           :location (collection/children-location parent)}]
    (mt/with-test-user :crowberto
      (is (= #{(:id parent) (:id child)}
             (#'typed-schemas.api.scope/collection-scope ["question-entity-id-1"]))))))

(deftest question-collection-scope-rejects-missing-collection-ref-test
  (mt/with-test-user :crowberto
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (#'typed-schemas.api.scope/collection-scope ["missing-entity-id-1"])))]
      (is (= 404 (:status-code (ex-data e)))))))
