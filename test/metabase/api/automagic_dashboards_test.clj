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
            [metabase.test
             [automagic-dashboards :refer :all]
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [toucan.util.test :as tt]))

(defn- api-call
  ([template args] (api-call template args (constantly true)))
  ([template args revoke-fn]
   (with-rasta
     (with-dashboard-cleanup
       (let [api-endpoint (apply format (str "automagic-dashboards/" template) args)]
         (and (some? ((test-users/user->client :rasta) :get 200 api-endpoint))
              (try
                (do
                  (perms/revoke-permissions! (perms-group/all-users) (data/id))
                  (revoke-fn)
                  (= ((test-users/user->client :rasta) :get 403 api-endpoint)
                     "You don't have permissions to do that."))
                (finally
                  (perms/grant-permissions! (perms-group/all-users) (perms/object-path (data/id)))))))))))


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
