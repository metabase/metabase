(ns metabase.api.pulse-test
  "Tests for /api/pulse endpoints."
  (:require [expectations :refer :all]
            (metabase [db :as db]
                      [http-client :as http]
                      [middleware :as middleware])
            (metabase.models [card :refer [Card]]
                             [database :refer [Database]]
                             [pulse :refer [Pulse], :as pulse])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

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
    {:id           $
     :name         $
     :created_at   $
     :updated_at   $
     :creator_id   $
     :creator      (user-details (db/select-one 'User :id (:creator_id pulse)))
     :cards        (map pulse-card-details (:cards pulse))
     :channels     (map pulse-channel-details (:channels pulse))}))

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

(expect {:errors {:name "field is a required param."}}
  ((user->client :rasta) :post 400 "pulse" {}))

(expect {:errors {:cards "field is a required param."}}
  ((user->client :rasta) :post 400 "pulse" {:name "abc"}))

(expect {:errors {:cards "Invalid value 'foobar' for 'cards': value must be an array."}}
  ((user->client :rasta) :post 400 "pulse" {:name  "abc"
                                            :cards "foobar"}))

(expect {:errors {:cards "Invalid value 'abc' for 'cards': array value must be a map."}}
  ((user->client :rasta) :post 400 "pulse" {:name  "abc"
                                            :cards ["abc"]}))

(expect {:errors {:channels "field is a required param."}}
  ((user->client :rasta) :post 400 "pulse" {:name "abc"
                                            :cards [{:id 100} {:id 200}]}))

(expect {:errors {:channels "Invalid value 'foobar' for 'channels': value must be an array."}}
  ((user->client :rasta) :post 400 "pulse" {:name    "abc"
                                            :cards   [{:id 100} {:id 200}]
                                            :channels "foobar"}))

(expect {:errors {:channels "Invalid value 'abc' for 'channels': array value must be a map."}}
  ((user->client :rasta) :post 400 "pulse" {:name     "abc"
                                            :cards    [{:id 100} {:id 200}]
                                            :channels ["abc"]}))

(defn- remove-extra-channels-fields [channels]
  (for [channel channels]
    (dissoc channel :id :pulse_id :created_at :updated_at)))

(tu/expect-with-temp [Card [card1]
                      Card [card2]]
  {:name         "A Pulse"
   :creator_id   (user->id :rasta)
   :creator      (user-details (fetch-user :rasta))
   :created_at   true
   :updated_at   true
   :cards        (mapv pulse-card-details [card1 card2])
   :channels     [{:enabled        true
                   :channel_type   "email"
                   :schedule_type  "daily"
                   :schedule_hour  12
                   :schedule_day   nil
                   :schedule_frame nil
                   :recipients     []}]}
  (-> (pulse-response ((user->client :rasta) :post 200 "pulse" {:name     "A Pulse"
                                                                :cards    [{:id (:id card1)} {:id (:id card2)}]
                                                                :channels [{:enabled       true
                                                                            :channel_type  "email"
                                                                            :schedule_type "daily"
                                                                            :schedule_hour 12
                                                                            :schedule_day  nil
                                                                            :recipients    []}]}))
      (update :channels remove-extra-channels-fields)))


;; ## PUT /api/pulse

(expect {:errors {:name "field is a required param."}}
  ((user->client :rasta) :put 400 "pulse/1" {}))

(expect {:errors {:cards "field is a required param."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name "abc"}))

(expect {:errors {:cards "Invalid value 'foobar' for 'cards': value must be an array."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name  "abc"
                                             :cards "foobar"}))

(expect {:errors {:cards "Invalid value 'abc' for 'cards': array value must be a map."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name  "abc"
                                             :cards ["abc"]}))

(expect {:errors {:channels "field is a required param."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name "abc"
                                             :cards [{:id 100} {:id 200}]}))

(expect {:errors {:channels "Invalid value 'foobar' for 'channels': value must be an array."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name    "abc"
                                             :cards   [{:id 100} {:id 200}]
                                             :channels "foobar"}))

(expect {:errors {:channels "Invalid value 'abc' for 'channels': array value must be a map."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name     "abc"
                                             :cards    [{:id 100} {:id 200}]
                                             :channels ["abc"]}))

(tu/expect-with-temp [Pulse [pulse]
                      Card  [card]]
  {:name         "Updated Pulse"
   :creator_id   (user->id :rasta)
   :creator      (user-details (fetch-user :rasta))
   :created_at   true
   :updated_at   true
   :cards        [(pulse-card-details card)]
   :channels     [{:enabled       true
                   :channel_type  "slack"
                   :schedule_type "hourly"
                   :schedule_hour nil
                   :schedule_day  nil
                   :schedule_frame nil
                   :details       {:channels "#general"}
                   :recipients    []}]}
  (-> (pulse-response ((user->client :rasta) :put 200 (format "pulse/%d" (:id pulse)) {:name     "Updated Pulse"
                                                                                       :cards    [{:id (:id card)}]
                                                                                       :channels [{:enabled       true
                                                                                                   :channel_type  "slack"
                                                                                                   :schedule_type "hourly"
                                                                                                   :schedule_hour 12
                                                                                                   :schedule_day  "mon"
                                                                                                   :recipients    []
                                                                                                   :details       {:channels "#general"}}]}))
      (update :channels remove-extra-channels-fields)))


;; ## DELETE /api/pulse/:id
(tu/expect-with-temp [Pulse [pulse]]
  nil
  (do
    ((user->client :rasta) :delete 204 (format "pulse/%d" (:id pulse)))
    (pulse/retrieve-pulse (:id pulse))))


;; ## GET /api/pulse -- should come back in alphabetical order
(tu/expect-with-temp [Pulse [pulse1 {:name "ABCDEF"}]
                      Pulse [pulse2 {:name "GHIJKL"}]]
  [(assoc (pulse-details pulse1) :read_only false)
   (assoc (pulse-details pulse2) :read_only false)]
  (do (db/cascade-delete! Pulse :id [:not-in #{(:id pulse1)
                                               (:id pulse2)}]) ; delete anything else in DB just to be sure; this step may not be neccesary any more
      ((user->client :rasta) :get 200 "pulse")))


;; ## GET /api/pulse/:id
(tu/expect-with-temp [Pulse [pulse]]
  (pulse-details pulse)
  ((user->client :rasta) :get 200 (str "pulse/" (:id pulse))))
