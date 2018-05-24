(ns metabase.api.alert-test
  (:require [expectations :refer :all]
            [metabase
             [email-test :as et]
             [http-client :as http]
             [middleware :as middleware]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [pulse :as pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
            [metabase.test.mock.util :refer [pulse-channel-defaults]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- user-details [user-kwd]
  (-> user-kwd
      fetch-user
      (select-keys [:email :first_name :last_login :is_qbnewb :is_superuser :last_name :date_joined :common_name])
      (assoc :id true)))

(defn- pulse-card-details [card]
  (-> card
      (select-keys [:name :description :display])
      (update :display name)
      (assoc :id true, :include_csv false, :include_xls false)))

(defn- recipient-details [user-kwd]
  (-> user-kwd
      user-details
      (dissoc :last_login :is_qbnewb :is_superuser :date_joined)))

(defn- alert-client
  [username]
  (comp tu/boolean-ids-and-timestamps (user->client username)))

(defn- default-email-channel
  ([pulse-card-id]
   (default-email-channel pulse-card-id [(fetch-user :rasta)]))
  ([pulse-card-id recipients]
   {:id            pulse-card-id
    :enabled       true
    :channel_type  "email"
    :schedule_type "hourly"
    :schedule_hour 12
    :schedule_day  "mon"
    :recipients    recipients
    :details       {}}))

;; ## /api/alert/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "alert"))
(expect (get middleware/response-unauthentic :body) (http/client :put 401 "alert/13"))


;; ## POST /api/alert

(expect
  {:errors {:alert_condition "value must be one of: `goal`, `rows`."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition "not rows"
                                            :card            "foobar"}))

(expect
  {:errors {:alert_first_only "value must be a boolean."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition   "rows"}))

(expect
  {:errors {:card "value must be a map."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition   "rows"
                                            :alert_first_only  false}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition   "rows"
                                            :alert_first_only  false
                                            :card              {:id 100}}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition   "rows"
                                            :alert_first_only  false
                                            :card              {:id 100}
                                            :channels          "foobar"}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition   "rows"
                                            :alert_first_only  false
                                            :card              {:id 100}
                                            :channels          ["abc"]}))

(defmacro ^:private with-test-email [& body]
  `(tu/with-temporary-setting-values [~'site-url "https://metabase.com/testmb"]
     (et/with-fake-inbox
       ~@body)))

(defmacro ^:private with-alert-setup
  "Macro that will cleanup any created pulses and setups a fake-inbox to validate emails are sent for new alerts"
  [& body]
  `(tu/with-model-cleanup [Pulse]
     (with-test-email
       ~@body)))

(defn- rasta-new-alert-email [body-map]
  (et/email-to :rasta {:subject "You set up an alert",
                       :body (merge {"https://metabase.com/testmb" true,
                                     "My question" true}
                                    body-map)}))

(defn- rasta-added-to-alert-email [body-map]
  (et/email-to :rasta {:subject "Crowberto Corv added you to an alert",
                       :body (merge {"https://metabase.com/testmb" true,
                                     "now getting alerts" true}
                                    body-map)}))

(defn- rasta-unsubscribe-email [body-map]
  (et/email-to :rasta {:subject "You unsubscribed from an alert",
                       :body (merge {"https://metabase.com/testmb" true}
                                    body-map)}))

(defn- rasta-deleted-email [body-map]
  (et/email-to :rasta {:subject "Crowberto Corv deleted an alert you created",
                       :body (merge {"Crowberto Corv deleted an alert" true}
                                    body-map)}))

(defn- default-alert [card]
  {:id                true
   :name              nil
   :creator_id        true
   :creator           (user-details :rasta)
   :created_at        true
   :updated_at        true
   :card              (pulse-card-details card)
   :alert_condition   "rows"
   :alert_first_only  false
   :alert_above_goal  nil
   :channels          [(merge pulse-channel-defaults
                              {:channel_type  "email"
                               :schedule_type "hourly"
                               :schedule_hour nil
                               :recipients    [(recipient-details :rasta)]
                               :updated_at    true,
                               :pulse_id      true,
                               :id            true,
                               :created_at    true})]
   :skip_if_empty     true})

;; Check creation of a new rows alert with email notification
(tt/expect-with-temp [Card [card1 {:name "My question"}]]
  [(-> (default-alert card1)
       (assoc-in [:card :include_csv] true)
       (update-in [:channels 0] merge {:schedule_hour 12, :schedule_type "daily", :recipients []}))
   (rasta-new-alert-email {"has any results" true})]
  (with-alert-setup
    [(et/with-expected-messages 1
       ((alert-client :rasta) :post 200 "alert"
        {:card              {:id (:id card1)}
         :alert_condition   "rows"
         :alert_first_only  false
         :channels          [{:enabled       true
                              :channel_type  "email"
                              :schedule_type "daily"
                              :schedule_hour 12
                              :schedule_day  nil
                              :recipients    []}]}))
     (et/regex-email-bodies #"https://metabase.com/testmb"
                            #"has any results"
                            #"My question")]))

(defn- setify-recipient-emails [results]
  (update results :channels (fn [channels]
                              (map #(update % :recipients set) channels))))

;; An admin created alert should notify others they've been subscribed
(tt/expect-with-temp [Card [card1 {:name "My question"}]]
  [(-> (default-alert card1)
       (assoc :creator (user-details :crowberto))
       (assoc-in [:card :include_csv] true)
       (update-in [:channels 0] merge {:schedule_hour 12, :schedule_type "daily", :recipients (set (map recipient-details [:rasta :crowberto]))}))
   (merge (et/email-to :crowberto {:subject "You set up an alert",
                                   :body {"https://metabase.com/testmb" true,
                                          "My question" true
                                          "now getting alerts" false
                                          "confirmation that your alert" true}})
          (rasta-added-to-alert-email {"My question" true
                                       "now getting alerts" true
                                       "confirmation that your alert" false}))]

  (with-alert-setup
    [(et/with-expected-messages 2
       (-> ((alert-client :crowberto) :post 200 "alert"
            {:card              {:id (:id card1)}
             :alert_condition   "rows"
             :alert_first_only  false
             :channels          [{:enabled       true
                                  :channel_type  "email"
                                  :schedule_type "daily"
                                  :schedule_hour 12
                                  :schedule_day  nil
                                  :details       {:emails nil}
                                  :recipients    (mapv fetch-user [:crowberto :rasta])}]})
           setify-recipient-emails))
     (et/regex-email-bodies #"https://metabase.com/testmb"
                            #"now getting alerts"
                            #"confirmation that your alert"
                            #"My question")]))

;; Check creation of a below goal alert
(expect
  (rasta-new-alert-email {"goes below its goal" true})
  (tt/with-temp* [Card [card1 {:name "My question"
                               :display "line"}]]
    (with-alert-setup
      (et/with-expected-messages 1
        ((user->client :rasta) :post 200 "alert"
         {:card              {:id (:id card1)}
          :alert_condition   "goal"
          :alert_above_goal  false
          :alert_first_only  false
          :channels          [{:enabled       true
                               :channel_type  "email"
                               :schedule_type "daily"
                               :schedule_hour 12
                               :schedule_day  nil
                               :recipients    []}]}))
      (et/regex-email-bodies #"https://metabase.com/testmb"
                             #"goes below its goal"
                             #"My question"))))

;; Check creation of a above goal alert
(expect
  (rasta-new-alert-email {"meets its goal" true})
  (tt/with-temp* [Card [card1 {:name "My question"
                              :display "bar"}]]
    (with-alert-setup
      (et/with-expected-messages 1
        ((user->client :rasta) :post 200 "alert"
         {:card              {:id (:id card1)}
          :alert_condition   "goal"
          :alert_above_goal  true
          :alert_first_only  false
          :channels          [{:enabled       true
                               :channel_type  "email"
                               :schedule_type "daily"
                               :schedule_hour 12
                               :schedule_day  nil
                               :recipients    []}]}))
      (et/regex-email-bodies #"https://metabase.com/testmb"
                             #"meets its goal"
                             #"My question"))))

;; ## PUT /api/alert

(expect
  {:errors {:alert_condition "value must be one of: `goal`, `rows`."}}
  ((user->client :rasta) :put 400 "alert/1" {}))

(expect
  {:errors {:alert_condition "value must be one of: `goal`, `rows`."}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition "not rows"}))

(expect
  {:errors {:alert_first_only "value must be a boolean."}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition   "rows"}))

(expect
  {:errors {:card "value must be a map."}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition   "rows"
                                             :alert_first_only  false}))

(expect
  {:errors {:card "value must be a map."}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition   "rows"
                                             :alert_first_only  false
                                             :card              "foobar"}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition   "rows"
                                             :alert_first_only  false
                                             :card              {:id 100}}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition   "rows"
                                             :alert_first_only  false
                                             :card              {:id 100}
                                             :channels          "foobar"}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :put 400 "alert/1" {:name              "abc"
                                             :alert_condition   "rows"
                                             :alert_first_only  false
                                             :card              {:id 100}
                                             :channels          ["abc"]}))

(defn- default-alert-req
  ([card pulse-card]
   (default-alert-req card pulse-card {} []))
  ([card pulse-card alert-map users]
   (merge {:card              {:id (u/get-id card)}
           :alert_condition   "rows"
           :alert_first_only  false
           :channels          [(if (seq users)
                                 (default-email-channel (u/get-id pulse-card) users)
                                 (default-email-channel (u/get-id pulse-card)))]
           :skip_if_empty     false}
          alert-map)))

(defn- default-pulse-row []
  {:alert_condition  "rows"
   :alert_first_only false
   :creator_id       (user->id :rasta)
   :name             nil})

;; Non-admin users can update alerts they created
(tt/expect-with-temp [Pulse [{pulse-id :id}                (default-pulse-row)]
                      Card  [{card-id :id :as card}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id :id}  {:user_id          (user->id :rasta)
                                                            :pulse_channel_id pc-id}]]
  (default-alert card)

  (tu/with-model-cleanup [Pulse]
    ((alert-client :rasta) :put 200 (format "alert/%d" pulse-id)
     (default-alert-req card pc-id))))

;; Admin users can update any alert
(tt/expect-with-temp [Pulse [{pulse-id :id}                (default-pulse-row)]
                      Card  [{card-id :id :as card}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id :id}  {:user_id          (user->id :rasta)
                                                            :pulse_channel_id pc-id}]]
  (default-alert card)

  (tu/with-model-cleanup [Pulse]
    ((alert-client :crowberto) :put 200 (format "alert/%d" pulse-id)
     (default-alert-req card pc-id))))

;; Admin users can update any alert, changing the related alert attributes
(tt/expect-with-temp [Pulse [{pulse-id :id}                (default-pulse-row)]
                      Card  [{card-id :id :as card}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id :id}  {:user_id          (user->id :rasta)
                                                            :pulse_channel_id pc-id}]]
  (merge (default-alert card)
         {:alert_first_only true, :alert_above_goal true, :alert_condition  "goal"})

  (tu/with-model-cleanup [Pulse]
    ((alert-client :crowberto) :put 200 (format "alert/%d" pulse-id)
     (default-alert-req card pc-id {:alert_first_only true, :alert_above_goal true, :alert_condition "goal"}
                        [(fetch-user :rasta)]))))

;; Admin users can add a recipieint, that recipient should be notified
(tt/expect-with-temp [Pulse [{pulse-id :id}                (default-pulse-row)]
                      Card  [{card-id :id :as card}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id :id}  {:user_id          (user->id :crowberto)
                                                            :pulse_channel_id pc-id}]]
  [(-> (default-alert card)
       (assoc-in [:channels 0 :recipients] (set (map recipient-details [:crowberto :rasta]))))
   (et/email-to :rasta {:subject "Crowberto Corv added you to an alert",
                        :body {"https://metabase.com/testmb" true, "now getting alerts" true}})]

  (with-alert-setup
    [(et/with-expected-messages 1
       (setify-recipient-emails
        ((alert-client :crowberto) :put 200 (format "alert/%d" pulse-id)
         (default-alert-req card pc-id {} [(fetch-user :crowberto)
                                           (fetch-user :rasta)]))))
     (et/regex-email-bodies #"https://metabase.com/testmb"
                            #"now getting alerts")]))

;; Admin users can remove a recipieint, that recipient should be notified
(tt/expect-with-temp [Pulse [{pulse-id :id} (default-pulse-row)]
                      Card  [{card-id :id :as card}]
                      PulseCard             [_              {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id-1 :id} {:user_id          (user->id :crowberto)
                                                             :pulse_channel_id pc-id}]
                      PulseChannelRecipient [{pcr-id-2 :id} {:user_id         (user->id :rasta)
                                                             :pulse_channel_id pc-id}]]
  [(-> (default-alert card)
       (assoc-in [:channels 0 :recipients] [(recipient-details :crowberto)]))
   (et/email-to :rasta {:subject "You’ve been unsubscribed from an alert",
                        :body    {"https://metabase.com/testmb" true,
                                  "letting you know that Crowberto Corv" true}})]
  (with-alert-setup
    [(et/with-expected-messages 1
       ((alert-client :crowberto) :put 200 (format "alert/%d" pulse-id)
        (default-alert-req card pc-id {} [(fetch-user :crowberto)])))
    (et/regex-email-bodies #"https://metabase.com/testmb"
                           #"letting you know that Crowberto Corv")]))

;; Non-admin users can't edit alerts they didn't create
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Pulse [{pulse-id :id} {:alert_condition   "rows"
                                         :alert_first_only  false
                                         :creator_id        (user->id :crowberto)}]
                  Card  [{card-id :id :as card}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [{pcr-id :id}  {:user_id          (user->id :rasta)
                                                        :pulse_channel_id pc-id}]]
    (with-alert-setup
      ((alert-client :rasta) :put 403 (format "alert/%d" pulse-id)
       (default-alert-req card pc-id)))))

;; Non-admin users can't edit alerts if they're not in the recipient list
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Pulse [{pulse-id :id} {:alert_condition   "rows"
                                         :alert_first_only  false
                                         :creator_id        (user->id :rasta)}]
                  Card  [{card-id :id :as card}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [{pcr-id :id}  {:user_id          (user->id :crowberto)
                                                        :pulse_channel_id pc-id}]]
    (with-alert-setup
      ((alert-client :rasta) :put 403 (format "alert/%d" pulse-id)
       (default-alert-req card pc-id)))))

(defn- basic-alert-query []
  {:name "Foo"
   :dataset_query {:database (data/id)
                   :type     :query
                   :query {:source_table (data/id :checkins)
                           :aggregation [["count"]]
                           :breakout [["datetime-field" (data/id :checkins :date) "hour"]]}}})

;; Basic test covering the /alert/question/:id call for a user
(tt/expect-with-temp [Card                 [{card-id :id :as card}  (basic-alert-query)]
                      Pulse                [{pulse-id :id} {:alert_condition   "rows"
                                                            :alert_first_only  false
                                                            :alert_above_goal  nil
                                                            :skip_if_empty     true
                                                            :name              nil}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                            :pulse_channel_id pc-id}]]
  [(-> (default-alert card)
       ;; The read_only flag is used by the UI to determine what the user is allowed to update
       (assoc :read_only false)
       (update-in [:channels 0] merge {:schedule_hour 15 :schedule_type "daily"}))]
  (with-alert-setup
   ((alert-client :rasta) :get 200 (format "alert/question/%d" card-id))))

;; Non-admin users shouldn't see alerts they created if they're no longer recipients
(expect
  [1 0]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id :id} {:alert_condition   "rows"
                                                        :alert_first_only  false
                                                        :alert_above_goal  true
                                                        :creator_id        (user->id :rasta)}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [{pcr-id :id}  {:user_id          (user->id :rasta)
                                                        :pulse_channel_id pc-id}]
                  PulseChannelRecipient [_             {:user_id          (user->id :crowberto)
                                                        :pulse_channel_id pc-id}]]
    (with-alert-setup
      [(count ((alert-client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (do
         (db/delete! PulseChannelRecipient :id pcr-id)
         (count ((alert-client :rasta) :get 200 (format "alert/question/%d" card-id))))])))

;; Non-admin users should not see others alerts, admins see all alerts
(expect
  [1 2]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id-1 :id} {:alert_condition   "rows"
                                                          :alert_first_only  false
                                                          :alert_above_goal  false
                                                          :creator_id        (user->id :rasta)}]
                  PulseCard             [_               {:pulse_id pulse-id-1
                                                          :card_id  card-id
                                                          :position 0}]
                  PulseChannel          [{pc-id-1 :id}   {:pulse_id pulse-id-1}]
                  PulseChannelRecipient [_               {:user_id          (user->id :rasta)
                                                          :pulse_channel_id pc-id-1}]
                  ;; A separate admin created alert
                  Pulse                [{pulse-id-2 :id} {:alert_condition   "rows"
                                                          :alert_first_only  false
                                                          :alert_above_goal  false
                                                          :creator_id        (user->id :crowberto)}]
                  PulseCard             [_               {:pulse_id pulse-id-2
                                                          :card_id  card-id
                                                          :position 0}]
                  PulseChannel          [{pc-id-2 :id}   {:pulse_id pulse-id-2}]
                  PulseChannelRecipient [_               {:user_id          (user->id :crowberto)
                                                          :pulse_channel_id pc-id-2}]
                  PulseChannel          [{pc-id-3 :id}   {:pulse_id     pulse-id-2
                                                          :channel_type "slack"}]]
    (with-alert-setup
      [(count ((alert-client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (count ((alert-client :crowberto) :get 200 (format "alert/question/%d" card-id)))])))

(expect
  "Admin user are not allowed to unsubscribe from alerts"
  ((user->client :crowberto) :put 400 (format "alert/1/unsubscribe")))

(defn- recipient-emails [results]
  (->> results
       first
       :channels
       first
       :recipients
       (map :email)
       set))

;; Alert has two recipients, remove one
(expect
  [#{"crowberto@metabase.com" "rasta@metabase.com"}
   #{"crowberto@metabase.com"}
   (rasta-unsubscribe-email {"Foo" true})]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id :id} {:alert_condition   "rows"
                                                        :alert_first_only  false}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                        :pulse_channel_id pc-id}]
                  PulseChannelRecipient [_             {:user_id          (user->id :crowberto)
                                                        :pulse_channel_id pc-id}]]
    (with-alert-setup
      [(recipient-emails ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (do
         (et/with-expected-messages 1
           ((user->client :rasta) :put 204 (format "alert/%d/unsubscribe" pulse-id)))
         (recipient-emails ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id))))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"Foo")])))

;; Alert should be deleted if the creator unsubscribes and there's no one left
(expect
  [1
   0
   (rasta-unsubscribe-email {"Foo" true})]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id :id} {:alert_condition  "rows"
                                                        :alert_first_only false
                                                        :creator_id       (user->id :rasta)}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id     pulse-id
                                                        :channel_type :email}]
                  PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                        :pulse_channel_id pc-id}]]
    (with-alert-setup
      [(count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (do
         (et/with-expected-messages 1
           ((user->client :rasta) :put 204 (format "alert/%d/unsubscribe" pulse-id)))
         (count ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id))))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"Foo")])))

;; Alert should not be deleted if there is a slack channel
(expect
  [1
   1 ;;<-- Alert should not be deleted
   (rasta-unsubscribe-email {"Foo" true})]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id :id} {:alert_condition  "rows"
                                                        :alert_first_only false
                                                        :creator_id       (user->id :rasta)}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id-1 :id} {:pulse_id     pulse-id
                                                        :channel_type :email}]
                  PulseChannel          [{pc-id-2 :id} {:pulse_id     pulse-id
                                                        :channel_type :slack}]
                  PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                        :pulse_channel_id pc-id-1}]]
    (with-alert-setup
      [(count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (do
         (et/with-expected-messages 1
           ((user->client :rasta) :put 204 (format "alert/%d/unsubscribe" pulse-id)))
         (count ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id))))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"Foo")])))

;; If email is disabled, users should be unsubscribed
(expect
  [1
   1 ;;<-- Alert should not be deleted
   (et/email-to :rasta {:subject "You’ve been unsubscribed from an alert",
                        :body    {"https://metabase.com/testmb" true,
                                  "letting you know that Crowberto Corv" true}})]
  (tt/with-temp* [Card                 [{card-id :id :as card}  (basic-alert-query)]
                  Pulse                [{pulse-id :id}          {:alert_condition  "rows"
                                                                 :alert_first_only false
                                                                 :creator_id       (user->id :rasta)}]
                  PulseCard             [_                      {:pulse_id pulse-id
                                                                 :card_id  card-id
                                                                 :position 0}]
                  PulseChannel          [{pc-id-1 :id}          {:pulse_id     pulse-id
                                                                 :channel_type :email}]
                  PulseChannel          [{pc-id-2 :id}          {:pulse_id     pulse-id
                                                                 :channel_type :slack}]
                  PulseChannelRecipient [_                      {:user_id          (user->id :rasta)
                                                                 :pulse_channel_id pc-id-1}]]
    (with-alert-setup
      [(count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (do
         (et/with-expected-messages 1
           ((alert-client :crowberto) :put 200 (format "alert/%d" pulse-id)
            (assoc-in (default-alert-req card pc-id-1) [:channels 0 :enabled] false)))
         (count ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id))))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"letting you know that Crowberto Corv" )])))

;; Re-enabling email should send users a subscribe notification
(expect
  [1
   1 ;;<-- Alert should not be deleted
   (et/email-to :rasta {:subject "Crowberto Corv added you to an alert",
                        :body    {"https://metabase.com/testmb" true,
                                  "now getting alerts about .*Foo" true}})]
  (tt/with-temp* [Card                 [{card-id :id :as card}  (basic-alert-query)]
                  Pulse                [{pulse-id :id}          {:alert_condition  "rows"
                                                                 :alert_first_only false
                                                                 :creator_id       (user->id :rasta)}]
                  PulseCard             [_                      {:pulse_id pulse-id
                                                                 :card_id  card-id
                                                                 :position 0}]
                  PulseChannel          [{pc-id-1 :id}          {:pulse_id     pulse-id
                                                                 :channel_type :email
                                                                 :enabled      false}]
                  PulseChannel          [{pc-id-2 :id}          {:pulse_id     pulse-id
                                                                 :channel_type :slack}]
                  PulseChannelRecipient [_                      {:user_id          (user->id :rasta)
                                                                 :pulse_channel_id pc-id-1}]]
    (with-alert-setup
      [(count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (do
         (et/with-expected-messages 1
           ((alert-client :crowberto) :put 200 (format "alert/%d" pulse-id)
            (assoc-in (default-alert-req card pc-id-1) [:channels 0 :enabled] true)))
         (count ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id))))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"now getting alerts about .*Foo" )])))

;; Alert should not be deleted if the unsubscriber isn't the creator
(expect
  [1
   1                                    ;<-- Alert should not be deleted
   (rasta-unsubscribe-email {"Foo" true})]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id :id} {:alert_condition  "rows"
                                                        :alert_first_only false
                                                        :creator_id       (user->id :crowberto)}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id-1 :id} {:pulse_id     pulse-id
                                                        :channel_type :email}]
                  PulseChannel          [{pc-id-2 :id} {:pulse_id     pulse-id
                                                        :channel_type :slack}]
                  PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                        :pulse_channel_id pc-id-1}]]
    (with-alert-setup
      [(count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (do
         (et/with-expected-messages 1
           ((user->client :rasta) :put 204 (format "alert/%d/unsubscribe" pulse-id)))
         (count ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id))))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"Foo")])))

;; Only admins can delete an alert
(expect
  [1 "You don't have permissions to do that."]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id :id} {:alert_condition   "rows"
                                                        :alert_first_only  false
                                                        :creator_id        (user->id :rasta)}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                        :pulse_channel_id pc-id}]]
    (with-alert-setup
      [(count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       ((user->client :rasta) :delete 403 (format "alert/%d" pulse-id))])))

;; Testing a user can't delete an admin's alert
(expect
  [1 nil 0]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id :id} {:alert_condition   "rows"
                                                        :alert_first_only  false
                                                        :creator_id        (user->id :crowberto)}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                        :pulse_channel_id pc-id}]]
    (with-alert-setup
      (let [original-alert-response ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id))]

        ;; A user can't delete an admin's alert
        ((user->client :rasta) :delete 403 (format "alert/%d" pulse-id))

        [(count original-alert-response)
         ((user->client :crowberto) :delete 204 (format "alert/%d" pulse-id))
         (count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))]))))

;; An admin can delete a user's alert
(expect
  [1 nil 0
   (rasta-deleted-email {})]
  (tt/with-temp*  [Card                 [{card-id :id}  (basic-alert-query)]
                   Pulse                [{pulse-id :id} {:alert_condition   "rows"
                                                         :alert_first_only  false
                                                         :creator_id        (user->id :rasta)}]
                   PulseCard             [_             {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                   PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                   PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                         :pulse_channel_id pc-id}]]
    (with-alert-setup
      [(count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (et/with-expected-messages 1
         ((user->client :crowberto) :delete 204 (format "alert/%d" pulse-id)))
       (count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (et/regex-email-bodies #"Crowberto Corv deleted an alert")])))

;; A deleted alert should notify the creator and any recipients
(expect
  [1 nil 0
   (merge
    (rasta-deleted-email {"Crowberto Corv unsubscribed you from alerts" false})
    (et/email-to :lucky {:subject "You’ve been unsubscribed from an alert",
                         :body {"Crowberto Corv deleted an alert" false
                                "Crowberto Corv unsubscribed you from alerts" true}}))]
  (tt/with-temp*  [Card                 [{card-id :id}  (basic-alert-query)]
                   Pulse                [{pulse-id :id} {:alert_condition   "rows"
                                                         :alert_first_only  false
                                                         :creator_id        (user->id :rasta)}]
                   PulseCard             [_             {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                   PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                   PulseChannelRecipient [_             {:user_id          (user->id :rasta)
                                                         :pulse_channel_id pc-id}]
                   PulseChannelRecipient [_             {:user_id          (user->id :lucky)
                                                         :pulse_channel_id pc-id}]]
    (with-alert-setup
      [(count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (et/with-expected-messages 2
         ((user->client :crowberto) :delete 204 (format "alert/%d" pulse-id)))
       (count ((user->client :rasta) :get 200 (format "alert/question/%d" card-id)))
       (et/regex-email-bodies #"Crowberto Corv deleted an alert"
                              #"Crowberto Corv unsubscribed you from alerts")])))

;; When an admin deletes their own alert, it should not notify them
(expect
  [1 nil 0 {}]
  (tt/with-temp* [Card                 [{card-id :id}  (basic-alert-query)]
                  Pulse                [{pulse-id :id} {:alert_condition   "rows"
                                                        :alert_first_only  false
                                                        :creator_id        (user->id :crowberto)}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (user->id :crowberto)
                                                        :pulse_channel_id pc-id}]]
    (with-alert-setup
      [(count ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id)))
       ((user->client :crowberto) :delete 204 (format "alert/%d" pulse-id))
       (count ((user->client :crowberto) :get 200 (format "alert/question/%d" card-id)))
       (et/regex-email-bodies #".*")])))
