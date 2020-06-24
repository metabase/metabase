(ns metabase.api.automagic-dashboards-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card Collection Metric Segment]]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as perms-group]]
            [metabase.test
             [automagic-dashboards :refer :all]
             [domain-entities :as de.test]
             [fixtures :as fixtures]
             [transforms :as transforms.test]]
            [metabase.transforms
             [core :as transforms]
             [materialize :as transforms.materialize]
             [specs :as transforms.specs]]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users :test-users-personal-collections))

(defn- api-call
  ([template args]
   (api-call template args (constantly true)))

  ([template args revoke-fn]
   (api-call template args revoke-fn some?))

  ([template args revoke-fn validation-fn]
   (mt/with-test-user :rasta
     (with-dashboard-cleanup
       (let [api-endpoint (apply format (str "automagic-dashboards/" template) args)
             result       (validation-fn ((mt/user->client :rasta) :get 200 api-endpoint))]
         (when (and result
                    (try
                      (testing "Endpoint should return 403 if user does not have permissions"
                        (perms/revoke-permissions! (perms-group/all-users) (mt/id))
                        (revoke-fn)
                        (let [result ((mt/user->client :rasta) :get 403 api-endpoint)]
                          (is (= "You don't have permissions to do that."
                                 result))
                          (= "You don't have permissions to do that." result)))
                      (finally
                        (perms/grant-permissions! (perms-group/all-users) (perms/object-path (mt/id))))))
           result))))))


;;; ------------------- X-ray  -------------------

(deftest table-xray-test
  (testing "GET /api/automagic-dashboards/table/:id"
    (is (some? (api-call "table/%s" [(mt/id :venues)]))))

  (testing "GET /api/automagic-dashboards/table/:id/rule/example/indepth"
    (is (some? (api-call "table/%s/rule/example/indepth" [(mt/id :venues)])))))

(deftest metric-xray-test
  (testing "GET /api/automagic-dashboards/metric/:id"
    (tt/with-temp Metric [{metric-id :id} {:table_id   (mt/id :venues)
                                           :definition {:query {:aggregation ["count"]}}}]
      (is (some? (api-call "metric/%s" [metric-id]))))))

(deftest segment-xray-test
  (tt/with-temp Segment [{segment-id :id} {:table_id   (mt/id :venues)
                                           :definition {:filter [:> [:field-id (mt/id :venues :price)] 10]}}]
    (testing "GET /api/automagic-dashboards/segment/:id"
      (is (some? (api-call "segment/%s" [segment-id]))))

    (testing "GET /api/automagic-dashboards/segment/:id/rule/example/indepth"
      (is (some? (api-call "segment/%s/rule/example/indepth" [segment-id]))))))


(deftest field-xray-test
  (testing "GET /api/automagic-dashboards/field/:id"
    (is (some? (api-call "field/%s" [(mt/id :venues :price)])))))

(defn- revoke-collection-permissions!
  [collection-id]
  (perms/revoke-collection-permissions! (perms-group/all-users) collection-id))

(deftest card-xray-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [cell-query (#'magic/encode-base64-json [:> [:field-id (mt/id :venues :price)] 5])]
      (doseq [test-fn
              [(fn [collection-id card-id]
                 (testing "GET /api/automagic-dashboards/question/:id"
                   (is (some? (api-call "question/%s" [card-id] #(revoke-collection-permissions! collection-id))))))

               (fn [collection-id card-id]
                 (testing "GET /api/automagic-dashboards/question/:id/cell/:cell-query"
                   (is (some? (api-call "question/%s/cell/%s"
                                        [card-id cell-query]
                                        #(revoke-collection-permissions! collection-id))))))

               (fn [collection-id card-id]
                 (testing "GET /api/automagic-dashboards/question/:id/cell/:cell-query/rule/example/indepth"
                   (is (some? (api-call "question/%s/cell/%s/rule/example/indepth"
                                        [card-id cell-query]
                                        #(revoke-collection-permissions! collection-id))))))]]
        (tt/with-temp* [Collection [{collection-id :id}]
                        Card       [{card-id :id} {:table_id      (mt/id :venues)
                                                   :collection_id collection-id
                                                   :dataset_query (mt/mbql-query venues
                                                                    {:filter [:> $price 10]})}]]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
          (test-fn collection-id card-id))))))

(deftest adhoc-query-xray-test
  (let [query (#'magic/encode-base64-json
               (mt/mbql-query venues
                 {:filter [:> $price 10]}))
        cell-query (#'magic/encode-base64-json
                    [:> [:field-id (mt/id :venues :price)] 5])]
    (testing "GET /api/automagic-dashboards/adhoc/:query"
      (is (some? (api-call "adhoc/%s" [query]))))

    (testing "GET /api/automagic-dashboards/adhoc/:query/cell/:cell-query"
      (is (some? (api-call "adhoc/%s/cell/%s" [query cell-query]))))

    (testing "GET /api/automagic-dashboards/adhoc/:query/cell/:cell-query/rule/example/indepth"
      (is (some? (api-call "adhoc/%s/cell/%s/rule/example/indepth" [query cell-query]))))))


;;; ------------------- Comparisons -------------------

(def ^:private segment
  (delay
   {:table_id   (mt/id :venues)
    :definition {:filter [:> [:field-id (mt/id :venues :price)] 10]}}))

(deftest comparisons-test
  (tt/with-temp Segment [{segment-id :id} @segment]
    (testing "GET /api/automagic-dashboards/table/:id/compare/segment/:segment-id"
      (is (some?
           (api-call "table/%s/compare/segment/%s"
                     [(mt/id :venues) segment-id]))))

    (testing "GET /api/automagic-dashboards/table/:id/rule/example/indepth/compare/segment/:segment-id"
      (is (some?
           (api-call "table/%s/rule/example/indepth/compare/segment/%s"
                     [(mt/id :venues) segment-id]))))

    (testing "GET /api/automagic-dashboards/adhoc/:id/cell/:cell-query/compare/segment/:segment-id"
      (is (some?
           (api-call "adhoc/%s/cell/%s/compare/segment/%s"
                     [(->> (mt/mbql-query venues
                             {:filter [:> $price 10]})
                           (#'magic/encode-base64-json))
                      (->> [:= [:field-id (mt/id :venues :price)] 15]
                           (#'magic/encode-base64-json))
                      segment-id]))))))


;;; ------------------- Transforms -------------------

(deftest transforms-test
  (testing "GET /api/automagic-dashboards/transform/:id"
    (mt/with-test-user :rasta
      (transforms.test/with-test-transform-specs
        (de.test/with-test-domain-entity-specs
          (mt/with-model-cleanup ['Card 'Collection]
            (transforms/apply-transform! (mt/id) "PUBLIC" (first @transforms.specs/transform-specs))
            (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 1.5 4 3 2 1]
                    [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 2.0 11 2 1 1]
                    [3 "The Apple Pan" 11 34.0406 -118.428 2 2.0 11 2 1 1]]
                   (api-call "transform/%s" ["Test transform"]
                             #(revoke-collection-permissions!
                               (transforms.materialize/get-collection "Test transform"))
                             (fn [dashboard]
                               (->> dashboard
                                    :ordered_cards
                                    (sort-by (juxt :row :col))
                                    last
                                    :card
                                    :dataset_query
                                    qp/process-query
                                    mt/rows)))))))))))
