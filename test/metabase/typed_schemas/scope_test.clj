(ns metabase.typed-schemas.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.scope :as typed-schemas.scope]))

(use-fixtures :once (fixtures/initialize :db :test-users))

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
             (select-keys (#'typed-schemas.scope/library-collections-scope
                           [{:id (:id data-child)} {:id (:id metric-child)}])
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
             (select-keys (#'typed-schemas.scope/library-collections-scope [{:entity-id "g-jLnamuHKdezZMthJ-z7"}])
                          [:collection-ids :data-collection-ids :metric-collection-ids]))))))

(deftest library-scope-includes-canonical-data-and-metrics-libraries-test
  (with-redefs [typed-schemas.scope/library-data-entity-id    "test-library-data"
                typed-schemas.scope/library-metrics-entity-id "test-library-metrics"]
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
               (select-keys (#'typed-schemas.scope/library-scope
                             {:include-data-library?   true
                              :include-metric-library? true})
                            [:collection-ids :data-collection-ids :metric-collection-ids])))))))

(deftest question-collection-scope-accepts-comma-separated-collection-ids-test
  (mt/with-temp [:model/Collection parent {:name "Question Parent"
                                           :location "/"}
                 :model/Collection child  {:name "Question Child"
                                           :location (collection/children-location parent)}]
    (mt/with-test-user :crowberto
      (is (= #{(:id parent) (:id child)}
             (#'typed-schemas.scope/collection-scope [{:id (:id parent)}]))))))

(deftest question-collection-scope-accepts-representation-entity-ids-test
  (mt/with-temp [:model/Collection parent {:name      "Question Parent"
                                           :entity_id "question-entity-id-1"
                                           :location  "/"}
                 :model/Collection child  {:name "Question Child"
                                           :location (collection/children-location parent)}]
    (mt/with-test-user :crowberto
      (is (= #{(:id parent) (:id child)}
             (#'typed-schemas.scope/collection-scope [{:entity-id "question-entity-id-1"}]))))))

(deftest question-collection-scope-rejects-missing-collection-ref-test
  (mt/with-test-user :crowberto
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (#'typed-schemas.scope/collection-scope [{:entity-id "missing-entity-id-1"}])))]
      (is (= 404 (:status-code (ex-data e)))))))
