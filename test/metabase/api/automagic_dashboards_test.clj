(ns metabase.api.automagic-dashboards-test
  (:require [expectations :refer :all]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [metric :refer [Metric]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [segment :refer [Segment]]]
            [metabase.query-processor :as qp]
            [metabase.test
             [automagic-dashboards :refer :all]
             [data :as data]
             [domain-entities :as de.test]
             [transforms :as transforms.test]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [metabase.transforms
             [core :as transforms]
             [materialize :as transforms.materialize]
             [specs :as transforms.specs]]
            [toucan.util.test :as tt]))

(defn- api-call
  ([template args] (api-call template args (constantly true)))
  ([template args revoke-fn] (api-call template args revoke-fn some?))
  ([template args revoke-fn validation-fn]
   (test-users/with-test-user :rasta
     (with-dashboard-cleanup
       (let [api-endpoint (apply format (str "automagic-dashboards/" template) args)
             result       (validation-fn ((test-users/user->client :rasta) :get 200 api-endpoint))]
         (when (and result
                    (try
                      (do
                        (perms/revoke-permissions! (perms-group/all-users) (data/id))
                        (revoke-fn)
                        (= ((test-users/user->client :rasta) :get 403 api-endpoint)
                           "You don't have permissions to do that."))
                      (finally
                        (perms/grant-permissions! (perms-group/all-users) (perms/object-path (data/id))))))
           result))))))


;;; ------------------- X-ray  -------------------

(expect (api-call "table/%s" [(data/id :venues)]))
(expect (api-call "table/%s/rule/example/indepth" [(data/id :venues)]))


(expect
   (tt/with-temp* [Metric [{metric-id :id} {:table_id (data/id :venues)
                                            :definition {:query {:aggregation ["count"]}}}]]
     (api-call "metric/%s" [metric-id])))


(expect
  (tt/with-temp* [Segment [{segment-id :id} {:table_id (data/id :venues)
                                             :definition {:filter [:> [:field-id (data/id :venues :price)] 10]}}]]
    (api-call "segment/%s" [segment-id])))

(expect
  (tt/with-temp* [Segment [{segment-id :id} {:table_id (data/id :venues)
                                             :definition {:filter [:> [:field-id (data/id :venues :price)] 10]}}]]
    (api-call "segment/%s/rule/example/indepth" [segment-id])))


(expect (api-call "field/%s" [(data/id :venues :price)]))

(defn- revoke-collection-permissions!
  [collection-id]
  (perms/revoke-collection-permissions! (perms-group/all-users) collection-id))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (data/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field-id (data/id :venues :price)] 10]
                                                                    :source-table (data/id :venues)}
                                                         :type     :query
                                                         :database (data/id)}}]]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
      (api-call "question/%s" [card-id] #(revoke-collection-permissions! collection-id)))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (data/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field-id (data/id :venues :price)] 10]
                                                                    :source-table (data/id :venues)}
                                                         :type     :query
                                                         :database (data/id)}}]]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
      (api-call "question/%s/cell/%s" [card-id (->> [:> [:field-id (data/id :venues :price)] 5]
                                                    (#'magic/encode-base64-json))]
                #(revoke-collection-permissions! collection-id)))))

(expect
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [{collection-id :id}]
                    Card [{card-id :id} {:table_id      (data/id :venues)
                                         :collection_id collection-id
                                         :dataset_query {:query    {:filter       [:> [:field-id (data/id :venues :price)] 10]
                                                                    :source-table (data/id :venues)}
                                                         :type     :query
                                                         :database (data/id)}}]]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-id)
      (api-call "question/%s/cell/%s/rule/example/indepth"
                [card-id (->> [:> [:field-id (data/id :venues :price)] 5]
                              (#'magic/encode-base64-json))]
                #(revoke-collection-permissions! collection-id)))))


(expect (api-call "adhoc/%s" [(->> {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                            :source-table (data/id :venues)}
                                    :type :query
                                    :database (data/id)}
                                   (#'magic/encode-base64-json))]))

(expect (api-call "adhoc/%s/cell/%s"
                  [(->> {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                 :source-table (data/id :venues)}
                         :type :query
                         :database (data/id)}
                        (#'magic/encode-base64-json))
                   (->> [:> [:field-id (data/id :venues :price)] 5]
                        (#'magic/encode-base64-json))]))

(expect (api-call "adhoc/%s/cell/%s/rule/example/indepth"
                  [(->> {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                 :source-table (data/id :venues)}
                         :type :query
                         :database (data/id)}
                        (#'magic/encode-base64-json))
                   (->> [:> [:field-id (data/id :venues :price)] 5]
                        (#'magic/encode-base64-json))]))


;;; ------------------- Comparisons -------------------

(def ^:private segment
  (delay
   {:table_id   (data/id :venues)
    :definition {:filter [:> [:field-id (data/id :venues :price)] 10]}}))

(expect
  (tt/with-temp* [Segment [{segment-id :id} @segment]]
    (api-call "table/%s/compare/segment/%s"
              [(data/id :venues) segment-id])))

(expect
  (tt/with-temp* [Segment [{segment-id :id} @segment]]
    (api-call "table/%s/rule/example/indepth/compare/segment/%s"
              [(data/id :venues) segment-id])))

(expect
  (tt/with-temp* [Segment [{segment-id :id} @segment]]
    (api-call "adhoc/%s/cell/%s/compare/segment/%s"
              [(->> {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                             :source-table (data/id :venues)}
                     :type :query
                     :database (data/id)}
                    (#'magic/encode-base64-json))
               (->> [:= [:field-id (data/id :venues :price)] 15]
                    (#'magic/encode-base64-json))
               segment-id])))


;;; ------------------- Transforms -------------------

(expect
  [[4 1 10.0646 -165.374 "Red Medicine" 3 1 4 3 2 1]
   [11 2 34.0996 -118.329 "Stout Burgers & Beers" 2 2 11 2 1 1]
   [11 3 34.0406 -118.428 "The Apple Pan" 2 2 11 2 1 1]]
  (test-users/with-test-user :rasta
    (transforms.test/with-test-transform-specs
      (de.test/with-test-domain-entity-specs
        (tu/with-model-cleanup ['Card 'Collection]
          (transforms/apply-transform! (data/id) "PUBLIC" (first @transforms.specs/transform-specs))
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
                           :data
                           :rows))))))))
