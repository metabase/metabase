(ns metabase.api.pulse-test
  "Tests for /api/pulse endpoints."
  (:require [expectations :refer :all]
            [metabase
             [email-test :as et]
             [http-client :as http]
             [middleware :as middleware]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [database :refer [Database]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [pulse :as pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [users :refer :all]]
            [metabase.test.mock.util :refer [pulse-channel-defaults]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## Helper Fns

(defn- user-details [user]
  (select-keys user [:email :first_name :last_login :is_qbnewb :is_superuser :id :last_name :date_joined :common_name]))

(defn- pulse-card-details [card]
  (-> (select-keys card [:id :name :description :display])
      (update :display name)
      (assoc :include_csv false :include_xls false)))

(defn- pulse-channel-details [channel]
  (select-keys channel [:schedule_type :schedule_details :channel_type :updated_at :details :pulse_id :id :enabled
                        :created_at]))

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
     :collection_id $
     :skip_if_empty $}))

(defn- pulse-response [{:keys [created_at updated_at], :as pulse}]
  (-> pulse
      (dissoc :id)
      (assoc :created_at (some? created_at)
             :updated_at (some? updated_at))))


;; ## /api/pulse/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (:body middleware/response-unauthentic) (http/client :get 401 "pulse"))
(expect (:body middleware/response-unauthentic) (http/client :put 401 "pulse/13"))


;; ## POST /api/pulse

(expect
  {:errors {:name "value must be a non-blank string."}}
  ((user->client :rasta) :post 400 "pulse" {}))

(expect
  {:errors {:cards (str "value must be an array. Each value must be a map with the keys `id`, `include_csv`, and "
                        "`include_xls`. The array cannot be empty.")}}
  ((user->client :rasta) :post 400 "pulse" {:name "abc"}))

(expect
  {:errors {:cards (str "value must be an array. Each value must be a map with the keys `id`, `include_csv`, and "
                        "`include_xls`. The array cannot be empty.")}}
  ((user->client :rasta) :post 400 "pulse" {:name  "abc"
                                            :cards "foobar"}))

(expect
  {:errors {:cards (str "value must be an array. Each value must be a map with the keys `id`, `include_csv`, and "
                        "`include_xls`. The array cannot be empty.")}}
  ((user->client :rasta) :post 400 "pulse" {:name  "abc"
                                            :cards ["abc"]}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name "abc"
                                            :cards [{:id 100, :include_csv false, :include_xls false}
                                                    {:id 200, :include_csv false, :include_xls false}]}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name    "abc"
                                            :cards   [{:id 100, :include_csv false, :include_xls false}
                                                      {:id 200, :include_csv false, :include_xls false}]
                                            :channels "foobar"}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "pulse" {:name     "abc"
                                            :cards    [{:id 100, :include_csv false, :include_xls false}
                                                       {:id 200, :include_csv false, :include_xls false}]
                                            :channels ["abc"]}))

(defn- remove-extra-channels-fields [channels]
  (for [channel channels]
    (dissoc channel :id :pulse_id :created_at :updated_at)))

(def ^:private pulse-defaults
  {:created_at    true
   :updated_at    true
   :skip_if_empty false
   :collection_id nil})

(tt/expect-with-temp [Card [card1]
                      Card [card2]]
  (merge
   pulse-defaults
   {:name       "A Pulse"
    :creator_id (user->id :rasta)
    :creator    (user-details (fetch-user :rasta))
    :cards      (mapv pulse-card-details [card1 card2])
    :channels   [(merge pulse-channel-defaults
                        {:channel_type  "email"
                         :schedule_type "daily"
                         :schedule_hour 12
                         :recipients    []})]})
  (tu/with-model-cleanup [Pulse]
    (-> (pulse-response ((user->client :rasta) :post 200 "pulse" {:name          "A Pulse"
                                                                  :cards         [{:id          (u/get-id card1)
                                                                                   :include_csv false
                                                                                   :include_xls false}
                                                                                  {:id          (u/get-id card2)
                                                                                   :include_csv false
                                                                                   :include_xls false}]
                                                                  :channels      [{:enabled       true
                                                                                   :channel_type  "email"
                                                                                   :schedule_type "daily"
                                                                                   :schedule_hour 12
                                                                                   :schedule_day  nil
                                                                                   :recipients    []}]
                                                                  :skip_if_empty false}))
        (update :channels remove-extra-channels-fields))))

;; Create a pulse with a csv and xls
(tt/expect-with-temp [Card [card1]
                      Card [card2]]
  (merge
   pulse-defaults
   {:name       "A Pulse"
    :creator_id (user->id :rasta)
    :creator    (user-details (fetch-user :rasta))
    :cards      [(assoc (pulse-card-details card1) :include_csv true :include_xls true)
                 (pulse-card-details card2)]
    :channels   [(merge pulse-channel-defaults
                        {:channel_type  "email"
                         :schedule_type "daily"
                         :schedule_hour 12
                         :recipients    []})]})
  (-> (pulse-response ((user->client :rasta) :post 200 "pulse" {:name          "A Pulse"
                                                                :cards         [{:id          (:id card1)
                                                                                 :include_csv true
                                                                                 :include_xls true}
                                                                                {:id          (:id card2)
                                                                                 :include_csv false
                                                                                 :include_xls false}]
                                                                :channels      [{:enabled       true
                                                                                 :channel_type  "email"
                                                                                 :schedule_type "daily"
                                                                                 :schedule_hour 12
                                                                                 :schedule_day  nil
                                                                                 :recipients    []}]
                                                                :skip_if_empty false}))
      (update :channels remove-extra-channels-fields)))


;; ## PUT /api/pulse

(expect
  {:errors {:name "value may be nil, or if non-nil, value must be a non-blank string."}}
  ((user->client :rasta) :put 400 "pulse/1" {:name 123}))

(expect
  {:errors {:cards (str "value may be nil, or if non-nil, value must be an array. Each value must be a map with the "
                        "keys `id`, `include_csv`, and `include_xls`. The array cannot be empty.")}}
  ((user->client :rasta) :put 400 "pulse/1" {:cards 123}))

(expect
  {:errors {:cards (str "value may be nil, or if non-nil, value must be an array. Each value must be a map with the "
                        "keys `id`, `include_csv`, and `include_xls`. The array cannot be empty.")}}
  ((user->client :rasta) :put 400 "pulse/1" {:cards "foobar"}))

(expect
  {:errors {:cards (str "value may be nil, or if non-nil, value must be an array. Each value must be a map with the "
                        "keys `id`, `include_csv`, and `include_xls`. The array cannot be empty.")}}
  ((user->client :rasta) :put 400 "pulse/1" {:cards ["abc"]}))

(expect
  {:errors {:channels "value may be nil, or if non-nil, value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:channels 123}))

(expect
  {:errors {:channels "value may be nil, or if non-nil, value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:channels "foobar"}))

(expect
  {:errors {:channels "value may be nil, or if non-nil, value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "pulse/1" {:channels ["abc"]}))

(tt/expect-with-temp [Pulse [pulse]
                      Card  [card]]
  (merge
   pulse-defaults
   {:name       "Updated Pulse"
    :creator_id (user->id :rasta)
    :creator    (user-details (fetch-user :rasta))
    :cards      [(pulse-card-details card)]
    :channels   [(merge pulse-channel-defaults
                        {:channel_type  "slack"
                         :schedule_type "hourly"
                         :details       {:channels "#general"}
                         :recipients    []})]})
  (-> (pulse-response ((user->client :rasta) :put 200 (format "pulse/%d" (u/get-id pulse))
                       {:name          "Updated Pulse"
                        :cards         [{:id          (u/get-id card)
                                         :include_csv false
                                         :include_xls false}]
                        :channels      [{:enabled       true
                                         :channel_type  "slack"
                                         :schedule_type "hourly"
                                         :schedule_hour 12
                                         :schedule_day  "mon"
                                         :recipients    []
                                         :details       {:channels "#general"}}]
                        :skip_if_empty false}))
      (update :channels remove-extra-channels-fields)))

;; Can we update *just* the Collection ID of a Pulse?
(expect
  (tt/with-temp* [Pulse      [pulse]
                  Collection [collection]]
    ((user->client :crowberto) :put 200 (str "pulse/" (u/get-id pulse))
     {:collection_id (u/get-id collection)})
    (= (db/select-one-field :collection_id Pulse :id (u/get-id pulse))
       (u/get-id collection))))


;; ## DELETE /api/pulse/:id
(expect
  nil
  (tt/with-temp Pulse [pulse]
    ((user->client :rasta) :delete 204 (format "pulse/%d" (u/get-id pulse)))
    (pulse/retrieve-pulse (u/get-id pulse))))

;; Check that a rando isn't allowed to delete a pulse
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Database  [{database-id :id}]
                  Table     [{table-id :id}    {:db_id database-id}]
                  Card      [card              {:dataset_query {:database database-id
                                                               :type     "query"
                                                               :query    {:source-table table-id
                                                                          :aggregation  {:aggregation-type "count"}}}}]
                  Pulse     [pulse             {:name "Daily Sad Toucans"}]
                  PulseCard [pulse-card        {:pulse_id (u/get-id pulse), :card_id (u/get-id card)}]]
    ;; revoke permissions for default group to this database
    (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path database-id))
    ;; now a user without permissions to the Card in question should *not* be allowed to delete the pulse
    ((user->client :rasta) :delete 403 (format "pulse/%d" (u/get-id pulse)))))



;; ## GET /api/pulse -- should come back in alphabetical order
(tt/expect-with-temp [Pulse [pulse1 {:name "ABCDEF"}]
                      Pulse [pulse2 {:name "GHIJKL"}]]
  [(assoc (pulse-details pulse1) :read_only false)
   (assoc (pulse-details pulse2) :read_only false)]
  (do
    ;; delete anything else in DB just to be sure; this step may not be neccesary any more
    (db/delete! Pulse :id [:not-in #{(:id pulse1)
                                     (:id pulse2)}])
    ((user->client :rasta) :get 200 "pulse")))

;; ## GET /api/pulse -- should not return alerts
(tt/expect-with-temp [Pulse [pulse1 {:name "ABCDEF"}]
                      Pulse [pulse2 {:name "GHIJKL"}]
                      Pulse [pulse3 {:name            "AAAAAA"
                                     :alert_condition "rows"}]]
  [(assoc (pulse-details pulse1) :read_only false)
   (assoc (pulse-details pulse2) :read_only false)]
  ((user->client :rasta) :get 200 "pulse"))

;; ## GET /api/pulse/:id
(tt/expect-with-temp [Pulse [pulse]]
  (pulse-details pulse)
  ((user->client :rasta) :get 200 (str "pulse/" (u/get-id pulse))))

;; ## GET /api/pulse/:id on an alert should 404
(tt/expect-with-temp [Pulse [{pulse-id :id} {:alert_condition "rows"}]]
  "Not found."
  ((user->client :rasta) :get 404 (str "pulse/" pulse-id)))

;; ## POST /api/pulse/test
(expect
  [{:ok true}
   (et/email-to :rasta {:subject "Pulse: Daily Sad Toucans"
                        :body    {"Daily Sad Toucans" true}})]
  (tu/with-model-cleanup [Pulse]
    (et/with-fake-inbox
      (data/with-db (data/get-or-create-database! defs/sad-toucan-incidents)
        (tt/with-temp* [Database  [{database-id :id}]
                        Table     [{table-id :id}    {:db_id database-id}]
                        Card      [{card-id :id}     {:dataset_query {:database database-id
                                                                      :type     "query"
                                                                      :query    {:source-table table-id,
                                                                                 :aggregation  {:aggregation-type "count"}}}}]]
          [((user->client :rasta) :post 200 "pulse/test" {:name          "Daily Sad Toucans"
                                                          :cards         [{:id          card-id
                                                                           :include_csv false
                                                                           :include_xls false}]
                                                          :channels      [{:enabled       true
                                                                           :channel_type  "email"
                                                                           :schedule_type "daily"
                                                                           :schedule_hour 12
                                                                           :schedule_day  nil
                                                                           :recipients    [(fetch-user :rasta)]}]
                                                          :skip_if_empty false})
           (et/regex-email-bodies #"Daily Sad Toucans")])))))
