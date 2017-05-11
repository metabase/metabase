(ns metabase.api.pulse-test
  "Tests for /api/pulse endpoints."
  (:require [expectations :refer :all]
            [metabase
             [http-client :as http]
             [middleware :as middleware]]
            [metabase.models
             [card :refer [Card]]
             [pulse :as pulse :refer [Pulse]]]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## Helper Fns

(defn- user-details [user]
  (select-keys user [:email :first_name :last_login :is_qbnewb :is_superuser :id :last_name :date_joined :common_name]))

(defn- pulse-card-details [card]
  (-> (select-keys card [:id :name :description :display])
      (update :display name)))

(defn- pulse-channel-details [channel]
  (select-keys channel [:schedule_type :schedule_details :channel_type :updated_at :details :pulse_id :id :enabled :created_at]))

(defn- pulse-details [pulse]
  (tu/match-$ pulse
    {:id            $
     :name          $
     :created_at    $
     :updated_at    $
     :creator_id    $
     :creator       (user-details (db/select-one 'User :id (:creator_id pulse)))
     :cards         (map pulse-card-details (:cards pulse))
     :channels      (map pulse-channel-details (:channels pulse))
     :skip_if_empty $}))

(defn- pulse-response [{:keys [created_at updated_at], :as pulse}]
  (-> pulse
      (dissoc :id)
      (assoc :created_at (not (nil? created_at))
             :updated_at (not (nil? updated_at)))))


;; ## /api/pulse/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "pulse"))
(expect (get middleware/response-unauthentic :body) (http/client :put 401 "pulse/13"))


;; ## POST /api/pulse

(expect {:errors {:name "value must be a non-blank string."}}
  ((user->client :rasta) :post 400 "pulse" {}))

(expect {:errors {:cards "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name "abc"}))

(expect {:errors {:cards "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name  "abc"
                                            :cards "foobar"}))

(expect {:errors {:cards "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name  "abc"
                                            :cards ["abc"]}))

(expect {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name "abc"
                                            :cards [{:id 100} {:id 200}]}))

(expect {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name    "abc"
                                            :cards   [{:id 100} {:id 200}]
                                            :channels "foobar"}))

(expect {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name     "abc"
                                            :cards    [{:id 100} {:id 200}]
                                            :channels ["abc"]}))

(defn- remove-extra-channels-fields [channels]
  (for [channel channels]
    (dissoc channel :id :pulse_id :created_at :updated_at)))

(tt/expect-with-temp [Card [card1]
                      Card [card2]]
  {:name          "A Pulse"
   :creator_id    (user->id :rasta)
   :creator       (user-details (fetch-user :rasta))
   :created_at    true
   :updated_at    true
   :cards         (mapv pulse-card-details [card1 card2])
   :channels      [{:enabled        true
                    :channel_type   "email"
                    :schedule_type  "daily"
                    :schedule_hour  12
                    :schedule_day   nil
                    :schedule_frame nil
                    :recipients     []}]
   :skip_if_empty false}
  (-> (pulse-response ((user->client :rasta) :post 200 "pulse" {:name          "A Pulse"
                                                                :cards         [{:id (:id card1)} {:id (:id card2)}]
                                                                :channels      [{:enabled       true
                                                                                 :channel_type  "email"
                                                                                 :schedule_type "daily"
                                                                                 :schedule_hour 12
                                                                                 :schedule_day  nil
                                                                                 :recipients    []}]
                                                                :skip_if_empty false}))
      (update :channels remove-extra-channels-fields)))


;; ## PUT /api/pulse

(expect {:errors {:name "value must be a non-blank string."}}
  ((user->client :rasta) :put 400 "pulse/1" {}))

(expect {:errors {:cards "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name "abc"}))

(expect {:errors {:cards "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name  "abc"
                                             :cards "foobar"}))

(expect {:errors {:cards "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name  "abc"
                                             :cards ["abc"]}))

(expect {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name "abc"
                                             :cards [{:id 100} {:id 200}]}))

(expect {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name    "abc"
                                             :cards   [{:id 100} {:id 200}]
                                             :channels "foobar"}))

(expect {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name     "abc"
                                             :cards    [{:id 100} {:id 200}]
                                             :channels ["abc"]}))

(tt/expect-with-temp [Pulse [pulse]
                      Card  [card]]
  {:name          "Updated Pulse"
   :creator_id    (user->id :rasta)
   :creator       (user-details (fetch-user :rasta))
   :created_at    true
   :updated_at    true
   :cards         [(pulse-card-details card)]
   :channels      [{:enabled       true
                    :channel_type  "slack"
                    :schedule_type "hourly"
                    :schedule_hour nil
                    :schedule_day  nil
                    :schedule_frame nil
                    :details       {:channels "#general"}
                    :recipients    []}]
   :skip_if_empty false}
  (-> (pulse-response ((user->client :rasta) :put 200 (format "pulse/%d" (:id pulse)) {:name          "Updated Pulse"
                                                                                       :cards         [{:id (:id card)}]
                                                                                       :channels      [{:enabled       true
                                                                                                        :channel_type  "slack"
                                                                                                        :schedule_type "hourly"
                                                                                                        :schedule_hour 12
                                                                                                        :schedule_day  "mon"
                                                                                                        :recipients    []
                                                                                                        :details       {:channels "#general"}}]
                                                                                       :skip_if_empty false}))
      (update :channels remove-extra-channels-fields)))


;; ## DELETE /api/pulse/:id
(expect
  nil
  (tt/with-temp Pulse [pulse]
    ((user->client :rasta) :delete 204 (format "pulse/%d" (:id pulse)))
    (pulse/retrieve-pulse (:id pulse))))


;; ## GET /api/pulse -- should come back in alphabetical order
(tt/expect-with-temp [Pulse [pulse1 {:name "ABCDEF"}]
                      Pulse [pulse2 {:name "GHIJKL"}]]
  [(assoc (pulse-details pulse1) :read_only false)
   (assoc (pulse-details pulse2) :read_only false)]
  (do (db/delete! Pulse :id [:not-in #{(:id pulse1)
                                               (:id pulse2)}]) ; delete anything else in DB just to be sure; this step may not be neccesary any more
      ((user->client :rasta) :get 200 "pulse")))


;; ## GET /api/pulse/:id
(tt/expect-with-temp [Pulse [pulse]]
  (pulse-details pulse)
  ((user->client :rasta) :get 200 (str "pulse/" (:id pulse))))
