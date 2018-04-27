(ns metabase.api.automagic-dashboards-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.models
             [card :refer [Card]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [user :as user]]
            [metabase.test.data :as data]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [toucan.util.test :as tt]))

(defmacro with-rasta
  "Execute body with rasta as the current user."
  [& body]
  `(binding [api/*current-user-id*              (test-users/user->id :rasta)
             api/*current-user-permissions-set* (-> :rasta
                                                    test-users/user->id
                                                    user/permissions-set
                                                    atom)]
     ~@body))

(defmacro ^:private with-dashboard-cleanup
  [& body]
  `(tu/with-model-cleanup [(quote ~'Card) (quote ~'Dashboard) (quote ~'Collection)
                           (quote ~'DashboardCard)]
     ~@body))

(defn- api-call
  [template & args]
  (with-rasta
    (with-dashboard-cleanup
      (some? ((test-users/user->client :rasta) :get 200 (apply format (str "automagic-dashboards/" template) args))))))

(expect (api-call "table/%s" (data/id :venues)))
(expect (api-call "table/%s/rule/example/indepth" (data/id :venues)))


(expect
   (tt/with-temp* [Metric [{metric-id :id} {:table_id (data/id :venues)
                                            :definition {:query {:aggregation ["count"]}}}]]
     (api-call "metric/%s" metric-id)))


(expect
  (tt/with-temp* [Segment [{segment-id :id} {:table_id (data/id :venues)
                                             :definition {:filter [:> [:field-id-id (data/id :venues :price)] 10]}}]]
    (api-call "segment/%s" segment-id)))

(expect
  (tt/with-temp* [Segment [{segment-id :id} {:table_id (data/id :venues)
                                             :definition {:filter [:> [:field-id (data/id :venues :price)] 10]}}]]
    (api-call "segment/%s/rule/example/indepth" segment-id)))


(expect (api-call "field/%s" (data/id :venues :price)))


(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (api-call "question/%s" card-id)))

(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (api-call "question/%s/cell/%s" card-id (->> [:> [:field-id (data/id :venues :price)] 5]
                                                 (#'magic/encode-base64-json)))))

(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                                               :source_table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (api-call "question/%s/cell/%s/rule/example/indepth" card-id
              (->> [:> [:field-id (data/id :venues :price)] 5]
                   (#'magic/encode-base64-json)))))


(expect (api-call "adhoc/%s" (->> {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                          :source_table (data/id :venues)}
                                  :type :query
                                   :database (data/id)}
                                  (#'magic/encode-base64-json))))

(expect (api-call "adhoc/%s/cell/%s"
                  (->> {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                :source_table (data/id :venues)}
                        :type :query
                        :database (data/id)}
                       (#'magic/encode-base64-json))
                  (->> [:> [:field-id (data/id :venues :price)] 5]
                       (#'magic/encode-base64-json))))

(expect (api-call "adhoc/%s/cell/%s/rule/example/indepth"
                  (->> {:query {:filter [:> [:field-id (data/id :venues :price)] 10]
                                :source_table (data/id :venues)}
                        :type :query
                        :database (data/id)}
                       (#'magic/encode-base64-json))
                  (->> [:> [:field-id (data/id :venues :price)] 5]
                   (#'magic/encode-base64-json))))
