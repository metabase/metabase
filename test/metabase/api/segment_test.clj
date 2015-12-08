(ns metabase.api.segment-test
  "Tests for /api/segment endpoints."
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            (metabase [http-client :as http]
                      [middleware :as middleware])
            (metabase.models [database :refer [Database]]
                             [segment :refer [Segment]]
                             [table :refer [Table]])
            [metabase.test.util :as tu]
            [metabase.test.data.users :refer :all]
            [metabase.test.data :refer :all]))

;; ## Helper Fns

(defn user-details [user]
  (tu/match-$ user
    {:id $
     :email $
     :date_joined $
     :first_name $
     :last_name $
     :last_login $
     :is_superuser $
     :common_name $}))

(defn segment-response [{:keys [created_at updated_at] :as segment}]
  (-> segment
      (dissoc :id :table_id)
      (assoc :created_at (not (nil? created_at)))
      (assoc :updated_at (not (nil? updated_at)))))


;; ## /api/segment/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "segment"))
(expect (get middleware/response-unauthentic :body) (http/client :put 401 "segment/13"))


;; ## POST /api/segment

;; test security.  requires superuser perms
(expect "You don't have permissions to do that."
  ((user->client :rasta) :post 403 "segment" {:name       "abc"
                                              :table_id   123
                                              :definition {}}))

;; test validations
(expect {:errors {:name "field is a required param."}}
  ((user->client :crowberto) :post 400 "segment" {}))

(expect {:errors {:table_id "field is a required param."}}
  ((user->client :crowberto) :post 400 "segment" {:name "abc"}))

(expect {:errors {:table_id "Invalid value 'foobar' for 'table_id': value must be an integer."}}
  ((user->client :crowberto) :post 400 "segment" {:name     "abc"
                                                  :table_id "foobar"}))

(expect {:errors {:definition "field is a required param."}}
  ((user->client :crowberto) :post 400 "segment" {:name     "abc"
                                                  :table_id 123}))

(expect {:errors {:definition "Invalid value 'foobar' for 'definition': value must be a dictionary."}}
  ((user->client :crowberto) :post 400 "segment" {:name       "abc"
                                                  :table_id   123
                                                  :definition "foobar"}))

(expect
  {:name         "A Segment"
   :description  "I did it!"
   :creator_id   (user->id :crowberto)
   :creator      (user-details (fetch-user :crowberto))
   :created_at   true
   :updated_at   true
   :is_active    true
   :definition   {:database 21
                  :query    {:filter ["abc"]}}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{:keys [id]} {:name   "Stuff"
                                       :db_id  database-id
                                       :active true}]
      (segment-response ((user->client :crowberto) :post 200 "segment" {:name        "A Segment"
                                                                        :description "I did it!"
                                                                        :table_id    id
                                                                        :definition  {:database 21
                                                                                      :query    {:filter ["abc"]}}})))))


;; ## PUT /api/segment

;; test security.  requires superuser perms
(expect "You don't have permissions to do that."
  ((user->client :rasta) :put 403 "segment/1" {:name             "abc"
                                               :definition       {}
                                               :revision_message "something different"}))

;; test validations
(expect {:errors {:name "field is a required param."}}
  ((user->client :crowberto) :put 400 "segment/1" {}))

(expect {:errors {:definition "field is a required param."}}
  ((user->client :crowberto) :put 400 "segment/1" {:name             "abc"
                                                   :revision_message "123"}))

(expect {:errors {:definition "Invalid value 'foobar' for 'definition': value must be a dictionary."}}
  ((user->client :crowberto) :put 400 "segment/1" {:name             "abc"
                                                   :revision_message "123"
                                                   :definition       "foobar"}))

(expect
  {:name         "Tatooine"
   :description  nil
   :creator_id   (user->id :rasta)
   :creator      (user-details (fetch-user :rasta))
   :created_at   true
   :updated_at   true
   :is_active    true
   :definition   {:database 2
                  :query    {:filter ["not" "the droids you're looking for"]}}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Stuff"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Segment [{:keys [id]} {:creator_id  (user->id :rasta)
                                           :table_id    table-id
                                           :name        "Droids in the desert"
                                           :description "Lookin' for a jedi"
                                           :definition  {}}]
        (segment-response ((user->client :crowberto) :put 200 (format "segment/%d" id) {:id               id
                                                                                        :name             "Tatooine"
                                                                                        :description      nil
                                                                                        :table_id         456
                                                                                        :revision_message "I got me some revisions"
                                                                                        :definition       {:database 2
                                                                                                           :query    {:filter ["not" "the droids you're looking for"]}}}))))))


;; ## DELETE /api/segment/:id


;; ## GET /api/segment


;; ## GET /api/segment/:id

(expect
  {:name         "One Segment to rule them all, one segment to define them"
   :description  "One segment to bring them all, and in the DataModel bind them"
   :creator_id   (user->id :crowberto)
   :creator      (user-details (fetch-user :crowberto))
   :created_at   true
   :updated_at   true
   :is_active    true
   :definition   {:database 123
                  :query    {:filter ["In the Land of Metabase where the Datas lie"]}}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Stuff"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Segment [{:keys [id]} {:creator_id  (user->id :crowberto)
                                           :table_id    table-id
                                           :name        "One Segment to rule them all, one segment to define them"
                                           :description "One segment to bring them all, and in the DataModel bind them"
                                           :definition  {:database 123
                                                         :query    {:filter ["In the Land of Metabase where the Datas lie"]}}}]
        (segment-response ((user->client :crowberto) :get 200 (format "segment/%d" id)))))))
