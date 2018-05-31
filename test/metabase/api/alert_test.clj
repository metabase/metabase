(ns metabase.api.alert-test
  "Tests for `/api/alert` endpoints."
  (:require [expectations :refer :all]
            [metabase
             [email-test :as et]
             [http-client :as http]
             [middleware :as middleware]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [permissions :as perms]
             [permissions-group :as group]
             [pulse :as pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]
             [pulse-test :as pulse-test]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as users :refer :all]
            [metabase.test.mock.util :refer [pulse-channel-defaults]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- user-details [user-kwd]
  (-> user-kwd
      fetch-user
      (select-keys [:email :first_name :last_login :is_qbnewb :is_superuser :last_name :common_name])
      (assoc :id true :date_joined true)))

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
  ([pulse-card]
   (default-email-channel pulse-card [(fetch-user :rasta)]))
  ([pulse-card recipients]
   {:id            pulse-card
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                POST /api/alert                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  {:errors {:alert_condition "value must be one of: `goal`, `rows`."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition "not rows"
                                            :card            "foobar"}))

(expect
  {:errors {:alert_first_only "value must be a boolean."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition "rows"}))

(expect
  {:errors {:card "value must be a map with the keys `id`, `include_csv`, and `include_xls`."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition  "rows"
                                            :alert_first_only false}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition  "rows"
                                            :alert_first_only false
                                            :card             {:id 100, :include_csv false, :include_xls false}}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition  "rows"
                                            :alert_first_only false
                                            :card             {:id 100, :include_csv false, :include_xls false}
                                            :channels         "foobar"}))

(expect
  {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
  ((user->client :rasta) :post 400 "alert" {:alert_condition  "rows"
                                            :alert_first_only false
                                            :card             {:id 100, :include_csv false, :include_xls false}
                                            :channels         ["abc"]}))

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
  {:id                  true
   :name                nil
   :creator_id          true
   :creator             (user-details :rasta)
   :created_at          true
   :updated_at          true
   :card                (pulse-card-details card)
   :alert_condition     "rows"
   :alert_first_only    false
   :alert_above_goal    nil
   :channels            [(merge pulse-channel-defaults
                                {:channel_type  "email"
                                 :schedule_type "hourly"
                                 :schedule_hour nil
                                 :recipients    [(recipient-details :rasta)]
                                 :updated_at    true
                                 :pulse_id      true
                                 :id            true
                                 :created_at    true})]
   :skip_if_empty       true
   :collection_id       false
   :collection_position nil})

(def ^:private daily-email-channel
  {:enabled       true
   :channel_type  "email"
   :schedule_type "daily"
   :schedule_hour 12
   :schedule_day  nil
   :recipients    []})

;; Check creation of a new rows alert with email notification
(tt/expect-with-temp [Card [card1 {:name "My question"}]]
  [(-> (default-alert card1)
       (assoc-in [:card :include_csv] true)
       (update-in [:channels 0] merge {:schedule_hour 12, :schedule_type "daily", :recipients []}))
   (rasta-new-alert-email {"has any results" true})]
  (with-alert-setup
    [(et/with-expected-messages 1
       ((alert-client :rasta) :post 200 "alert"
        {:card             {:id (u/get-id card1), :include_csv false, :include_xls false}
         :alert_condition  "rows"
         :alert_first_only false
         :channels         [daily-email-channel]}))
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
       (update-in [:channels 0] merge {:schedule_hour 12
                                       :schedule_type "daily"
                                       :recipients    (set (map recipient-details [:rasta :crowberto]))}))
   (merge (et/email-to :crowberto {:subject "You set up an alert"
                                   :body    {"https://metabase.com/testmb"  true
                                             "My question"                  true
                                             "now getting alerts"           false
                                             "confirmation that your alert" true}})
          (rasta-added-to-alert-email {"My question"                  true
                                       "now getting alerts"           true
                                       "confirmation that your alert" false}))]

  (with-alert-setup
    [(et/with-expected-messages 2
       (-> ((alert-client :crowberto) :post 200 "alert"
            {:card             {:id (u/get-id card1), :include_csv false, :include_xls false}
             :alert_condition  "rows"
             :alert_first_only false
             :channels         [(assoc daily-email-channel
                                  :details       {:emails nil}
                                  :recipients    (mapv fetch-user [:crowberto :rasta]))]})
           setify-recipient-emails))
     (et/regex-email-bodies #"https://metabase.com/testmb"
                            #"now getting alerts"
                            #"confirmation that your alert"
                            #"My question")]))

;; Check creation of a below goal alert
(expect
  (rasta-new-alert-email {"goes below its goal" true})
  (tt/with-temp* [Card [card1 {:name    "My question"
                               :display "line"}]]
    (with-alert-setup
      (et/with-expected-messages 1
        ((user->client :rasta) :post 200 "alert"
         {:card             {:id (u/get-id card1), :include_csv false, :include_xls false}
          :alert_condition  "goal"
          :alert_above_goal false
          :alert_first_only false
          :channels         [daily-email-channel]}))
      (et/regex-email-bodies #"https://metabase.com/testmb"
                             #"goes below its goal"
                             #"My question"))))

;; Check creation of a above goal alert
(expect
  (rasta-new-alert-email {"meets its goal" true})
  (tt/with-temp* [Card [card1 {:name    "My question"
                               :display "bar"}]]
    (with-alert-setup
      (et/with-expected-messages 1
        ((user->client :rasta) :post 200 "alert"
         {:card             {:id (u/get-id card1), :include_csv false, :include_xls false}
          :alert_condition  "goal"
          :alert_above_goal true
          :alert_first_only false
          :channels         [daily-email-channel]}))
      (et/regex-email-bodies #"https://metabase.com/testmb"
                             #"meets its goal"
                             #"My question"))))

;; Make sure we can create a Pulse with a Collection position
(expect
 #metabase.models.pulse.PulseInstance{:collection_id true, :collection_position 1}
 (tu/with-model-cleanup [Pulse]
   (tt/with-temp* [Card       [card]
                   Collection [collection]]
     (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
     ((user->client :rasta) :post 200 "alert" {:card                {:id          (u/get-id card)
                                                                     :include_csv false
                                                                     :include_xls false}
                                               :alert_condition     "goal"
                                               :alert_above_goal    false
                                               :alert_first_only    false
                                               :channels            [daily-email-channel]
                                               :collection_id       (u/get-id collection)
                                               :collection_position 1})
     (some-> (db/select-one [Pulse :collection_id :collection_position] :collection_id (u/get-id collection))
             (update :collection_id (partial = (u/get-id collection)))))))

;; ...but not if we don't have permissions for the Collection
(expect
  nil
  (tt/with-temp* [Card       [card]
                  Collection [collection]]
    ((user->client :rasta) :post 403 "alert" {:card                {:id          (u/get-id card)
                                                                    :include_csv false
                                                                    :include_xls false}
                                              :alert_condition     "goal"
                                              :alert_above_goal    false
                                              :alert_first_only    false
                                              :channels            [daily-email-channel]
                                              :collection_id       (u/get-id collection)
                                              :collection_position 1})
    (some-> (db/select-one [Pulse :collection_id :collection_position] :collection_id (u/get-id collection))
            (update :collection_id (partial = (u/get-id collection))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PUT /api/alert/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  {:errors {:alert_condition "value may be nil, or if non-nil, value must be one of: `goal`, `rows`."}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition "not rows"}))

(expect
  {:errors {:alert_first_only "value may be nil, or if non-nil, value must be a boolean."}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_first_only 1000}))

(expect
  {:errors {:card (str "value may be nil, or if non-nil, value must be a map with the keys `id`, `include_csv`, "
                       "and `include_xls`.")}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition  "rows"
                                             :alert_first_only false
                                             :card             "foobar"}))

(expect
  {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a map. The "
                           "array cannot be empty.")}}
  ((user->client :rasta) :put 400 "alert/1" {:alert_condition  "rows"
                                             :alert_first_only false
                                             :card             {:id 100, :include_csv false, :include_xls false}
                                             :channels         "foobar"}))

(expect
  {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a map. The "
                           "array cannot be empty.")}}
  ((user->client :rasta) :put 400 "alert/1" {:name             "abc"
                                             :alert_condition  "rows"
                                             :alert_first_only false
                                             :card             {:id 100, :include_csv false, :include_xls false}
                                             :channels         ["abc"]}))

(defn- default-alert-req
  ([card pulse-card-or-id]
   (default-alert-req card pulse-card-or-id {} []))
  ([card pulse-card-or-id alert-map users]
   (merge {:card             {:id (u/get-id card), :include_csv false, :include_xls false}
           :alert_condition  "rows"
           :alert_first_only false
           :channels         [(if (seq users)
                                (default-email-channel (u/get-id pulse-card-or-id) users)
                                (default-email-channel (u/get-id pulse-card-or-id)))]
           :skip_if_empty    false}
          alert-map)))

(defn- basic-alert []
  {:alert_condition  "rows"
   :alert_first_only false
   :creator_id       (user->id :rasta)
   :name             nil})

(defn- recipient [pulse-channel-or-id username-keyword]
  (let [user (users/fetch-user username-keyword)]
    {:user_id          (u/get-id user)
     :pulse_channel_id (u/get-id pulse-channel-or-id)}))

(defn- pulse-card [alert-or-id card-or-id]
  {:pulse_id (u/get-id alert-or-id)
   :card_id  (u/get-id card-or-id)
   :position 0})

(defn- pulse-channel [alert-or-id]
  {:pulse_id (u/get-id alert-or-id)})

(defn- alert-url [alert-or-id]
  (format "alert/%d" (u/get-id alert-or-id)))

;; Non-admin users can update alerts they created *if* they are in the recipient list
(tt/expect-with-temp [Pulse                 [alert (basic-alert)]
                      Card                  [card]
                      PulseCard             [_     (pulse-card alert card)]
                      PulseChannel          [pc    (pulse-channel alert)]
                      PulseChannelRecipient [_     (recipient pc :rasta)]]
  (default-alert card)

  (tu/with-model-cleanup [Pulse]
    ((alert-client :rasta) :put 200 (alert-url alert)
     (default-alert-req card pc))))

;; Admin users can update any alert
(tt/expect-with-temp [Pulse                 [alert (basic-alert)]
                      Card                  [card]
                      PulseCard             [_     (pulse-card alert card)]
                      PulseChannel          [pc    (pulse-channel alert)]
                      PulseChannelRecipient [_     (recipient pc :rasta)]]
  (default-alert card)

  (tu/with-model-cleanup [Pulse]
    ((alert-client :crowberto) :put 200 (alert-url alert)
     (default-alert-req card pc))))

;; Admin users can update any alert, changing the related alert attributes
(tt/expect-with-temp [Pulse                 [alert (basic-alert)]
                      Card                  [card]
                      PulseCard             [_     (pulse-card alert card)]
                      PulseChannel          [pc    (pulse-channel alert)]
                      PulseChannelRecipient [_     (recipient pc :rasta)]]
  (assoc (default-alert card)
    :alert_first_only true
    :alert_above_goal true
    :alert_condition  "goal")

  (tu/with-model-cleanup [Pulse]
    ((alert-client :crowberto) :put 200 (alert-url alert)
     (default-alert-req card (u/get-id pc) {:alert_first_only true, :alert_above_goal true, :alert_condition "goal"}
                        [(fetch-user :rasta)]))))

;; Admin users can add a recipieint, that recipient should be notified
(tt/expect-with-temp [Pulse                 [alert (basic-alert)]
                      Card                  [card]
                      PulseCard             [_     (pulse-card alert card)]
                      PulseChannel          [pc    (pulse-channel alert)]
                      PulseChannelRecipient [_     (recipient pc :crowberto)]]
  [(-> (default-alert card)
       (assoc-in [:channels 0 :recipients] (set (map recipient-details [:crowberto :rasta]))))
   (et/email-to :rasta {:subject "Crowberto Corv added you to an alert"
                        :body    {"https://metabase.com/testmb" true, "now getting alerts" true}})]

  (with-alert-setup
    [(et/with-expected-messages 1
       (setify-recipient-emails
        ((alert-client :crowberto) :put 200 (alert-url alert)
         (default-alert-req card pc {} [(fetch-user :crowberto)
                                        (fetch-user :rasta)]))))
     (et/regex-email-bodies #"https://metabase.com/testmb"
                            #"now getting alerts")]))

;; Admin users can remove a recipieint, that recipient should be notified
(tt/expect-with-temp [Pulse                 [alert (basic-alert)]
                      Card                  [card]
                      PulseCard             [_     (pulse-card alert card)]
                      PulseChannel          [pc    (pulse-channel alert)]
                      PulseChannelRecipient [_     (recipient pc :crowberto)]
                      PulseChannelRecipient [_     (recipient pc :rasta)]]
  [(-> (default-alert card)
       (assoc-in [:channels 0 :recipients] [(recipient-details :crowberto)]))
   (et/email-to :rasta {:subject "You’ve been unsubscribed from an alert"
                        :body    {"https://metabase.com/testmb"          true
                                  "letting you know that Crowberto Corv" true}})]
  (with-alert-setup
    [(et/with-expected-messages 1
       ((alert-client :crowberto) :put 200 (alert-url alert)
        (default-alert-req card (u/get-id pc) {} [(fetch-user :crowberto)])))
    (et/regex-email-bodies #"https://metabase.com/testmb"
                           #"letting you know that Crowberto Corv")]))

;; Non-admin users can't edit alerts they didn't create
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Pulse                 [alert (assoc (basic-alert) :creator_id (user->id :crowberto))]
                  Card                  [card]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [_     (recipient pc :rasta)]]
    (with-alert-setup
      ((alert-client :rasta) :put 403 (alert-url alert)
       (default-alert-req card pc)))))

;; Non-admin users can't edit alerts if they're not in the recipient list
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Pulse                 [alert (basic-alert)]
                  Card                  [card]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [_     (recipient pc :crowberto)]]
    (with-alert-setup
      ((alert-client :rasta) :put 403 (alert-url alert)
       (default-alert-req card pc)))))

;; Can we update *just* the Collection ID of an Alert?
(expect
  (tt/with-temp* [Pulse      [alert      {:alert_condition "rows"}]
                  Collection [collection]]
    ((user->client :crowberto) :put 200 (str "alert/" (u/get-id alert))
     {:collection_id (u/get-id collection)})
    (= (db/select-one-field :collection_id Pulse :id (u/get-id alert))
       (u/get-id collection))))

(defmacro ^:private with-alert-in-collection
  {:style/indent 1}
  [[db-binding collection-binding alert-binding] & body]
  `(pulse-test/with-pulse-in-collection [~db-binding ~collection-binding alert#]
     ;; Make this Alert actually be an alert
     (db/update! Pulse (u/get-id alert#) :alert_condition "rows")
     (let [~alert-binding alert#]
       ~@body)))

;; Can we change the Collection a Alert is in (assuming we have the permissions to do so)?
(expect
  (with-alert-in-collection [_ collection alert]
    (tt/with-temp Collection [new-collection]
      ;; grant Permissions for both new and old collections
      (doseq [coll [collection new-collection]]
        (perms/grant-collection-readwrite-permissions! (group/all-users) coll))
      ;; now make an API call to move collections
      ((user->client :rasta) :put 200 (str "alert/" (u/get-id alert)) {:collection_id (u/get-id new-collection)})
      ;; Check to make sure the ID has changed in the DB
      (= (db/select-one-field :collection_id Pulse :id (u/get-id alert))
         (u/get-id new-collection)))))

;; ...but if we don't have the Permissions for the old collection, we should get an Exception
(expect
  "You don't have permissions to do that."
  (with-alert-in-collection [_ collection alert]
    (tt/with-temp Collection [new-collection]
      ;; grant Permissions for only the *new* collection
      (perms/grant-collection-readwrite-permissions! (group/all-users) new-collection)
      ;; now make an API call to move collections. Should fail
      ((user->client :rasta) :put 403 (str "alert/" (u/get-id alert)) {:collection_id (u/get-id new-collection)}))))

;; ...and if we don't have the Permissions for the new collection, we should get an Exception
(expect
  "You don't have permissions to do that."
  (with-alert-in-collection [_ collection alert]
    (tt/with-temp Collection [new-collection]
      ;; grant Permissions for only the *old* collection
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
      ;; now make an API call to move collections. Should fail
      ((user->client :rasta) :put 403 (str "alert/" (u/get-id alert)) {:collection_id (u/get-id new-collection)}))))

;; Can we change the Collection position of an Alert?
(expect
  1
  (with-alert-in-collection [_ collection pulse]
    (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
    ((user->client :rasta) :put 200 (str "alert/" (u/get-id pulse))
     {:collection_position 1})
    (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))

;; ...and unset (unpin) it as well?
(expect
  nil
  (with-alert-in-collection [_ collection pulse]
    (db/update! Pulse (u/get-id pulse) :collection_position 1)
    (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
    ((user->client :rasta) :put 200 (str "alert/" (u/get-id pulse))
     {:collection_position nil})
    (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))

;; ...we shouldn't be able to if we don't have permissions for the Collection
(expect
  nil
  (with-alert-in-collection [_ collection pulse]
    ((user->client :rasta) :put 403 (str "alert/" (u/get-id pulse))
     {:collection_position 1})
    (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))

(expect
  1
  (with-alert-in-collection [_ collection pulse]
    (db/update! Pulse (u/get-id pulse) :collection_position 1)
    ((user->client :rasta) :put 403 (str "alert/" (u/get-id pulse))
     {:collection_position nil})
    (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            GET /alert/question/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- basic-alert-query []
  {:name          "Foo"
   :dataset_query {:database (data/id)
                   :type     :query
                   :query    {:source_table (data/id :checkins)
                              :aggregation  [["count"]]
                              :breakout     [["datetime-field" (data/id :checkins :date) "hour"]]}}})

(defn- alert-question-url [card-or-id]
  (format "alert/question/%d" (u/get-id card-or-id)))

(defn- api:alert-question-count [user-kw card-or-id]
  (count ((alert-client user-kw) :get 200 (alert-question-url card-or-id))))

(tt/expect-with-temp [Card                 [card  (basic-alert-query)]
                      Pulse                [alert {:alert_condition  "rows"
                                                   :alert_first_only false
                                                   :alert_above_goal nil
                                                   :skip_if_empty    true
                                                   :name             nil}]
                      PulseCard             [_    (pulse-card alert card)]
                      PulseChannel          [pc   (pulse-channel alert)]
                      PulseChannelRecipient [_    (recipient pc :rasta)]]
  [(-> (default-alert card)
       ;; The read_only flag is used by the UI to determine what the user is allowed to update
       (assoc :read_only false)
       (update-in [:channels 0] merge {:schedule_hour 15 :schedule_type "daily"}))]
  (with-alert-setup
    ((alert-client :rasta) :get 200 (alert-question-url card))))

;; Non-admin users shouldn't see alerts they created if they're no longer recipients
(expect
  [1 0]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (assoc (basic-alert) :alert_above_goal true)]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [pcr   (recipient pc :rasta)]
                  PulseChannelRecipient [_     (recipient pc :crowberto)]]
    (with-alert-setup
      [(count ((alert-client :rasta) :get 200 (alert-question-url card)))
       (do
         (db/delete! PulseChannelRecipient :id (u/get-id pcr))
         (api:alert-question-count :rasta card))])))

;; Non-admin users should not see others alerts, admins see all alerts
(expect
  [1 2]
  (tt/with-temp* [Card                  [card    (basic-alert-query)]
                  Pulse                 [alert-1 (assoc (basic-alert)
                                                   :alert_above_goal false)]
                  PulseCard             [_       (pulse-card alert-1 card)]
                  PulseChannel          [pc-1    (pulse-channel alert-1)]
                  PulseChannelRecipient [_       (recipient pc-1 :rasta)]
                  ;; A separate admin created alert
                  Pulse                 [alert-2 (assoc (basic-alert)
                                                   :alert_above_goal false
                                                   :creator_id       (user->id :crowberto))]
                  PulseCard             [_       (pulse-card alert-2 card)]
                  PulseChannel          [pc-2    (pulse-channel alert-2)]
                  PulseChannelRecipient [_       (recipient pc-2 :crowberto)]
                  PulseChannel          [pc-3    (assoc (pulse-channel alert-2) :channel_type "slack")]]
    (with-alert-setup
      [(api:alert-question-count :rasta     card)
       (api:alert-question-count :crowberto card)])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         PUT /api/alert/:id/unsubscribe                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- alert-unsubscribe-url [alert-or-id]
  (format "alert/%d/unsubscribe" (u/get-id alert-or-id)))

(defn- api:unsubscribe! [user-kw expected-status-code alert-or-id]
  ((user->client user-kw) :put expected-status-code (alert-unsubscribe-url alert-or-id)))

(expect
  "Admin users are not allowed to unsubscribe from alerts"
  (api:unsubscribe! :crowberto 400 1))

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
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (basic-alert)]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [_     (recipient pc :rasta)]
                  PulseChannelRecipient [_     (recipient pc :crowberto)]]
    (with-alert-setup
      [(recipient-emails ((user->client :rasta) :get 200 (alert-question-url card)))
       (do
         (et/with-expected-messages 1
           (api:unsubscribe! :rasta 204 alert))
         (recipient-emails ((user->client :crowberto) :get 200 (alert-question-url card))))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"Foo")])))

;; Alert should be deleted if the creator unsubscribes and there's no one left
(expect
  [1
   0
   (rasta-unsubscribe-email {"Foo" true})]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (basic-alert)]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [_     (recipient pc :rasta)]]
    (with-alert-setup
      [(api:alert-question-count :rasta card)
       (do
         (et/with-expected-messages 1
           (api:unsubscribe! :rasta 204 alert))
         (api:alert-question-count :crowberto card))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"Foo")])))

;; Alert should not be deleted if there is a slack channel
(expect
  [1
   1 ;;<-- Alert should not be deleted
   (rasta-unsubscribe-email {"Foo" true})]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (basic-alert)]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc-1  (assoc (pulse-channel alert) :channel_type :email)]
                  PulseChannel          [pc-2  (assoc (pulse-channel alert) :channel_type :slack)]
                  PulseChannelRecipient [_     (recipient pc-1 :rasta)]]
    (with-alert-setup
      [(api:alert-question-count :rasta card)
       (do
         (et/with-expected-messages 1
           (api:unsubscribe! :rasta 204 alert))
         (api:alert-question-count :crowberto card))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"Foo")])))

;; If email is disabled, users should be unsubscribed
(expect
  [1
   1 ;;<-- Alert should not be deleted
   (et/email-to :rasta {:subject "You’ve been unsubscribed from an alert",
                        :body    {"https://metabase.com/testmb"          true,
                                  "letting you know that Crowberto Corv" true}})]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (basic-alert)]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc-1  (assoc (pulse-channel alert) :channel_type :email)]
                  PulseChannel          [pc-2  (assoc (pulse-channel alert) :channel_type :slack)]
                  PulseChannelRecipient [_     (recipient pc-1 :rasta)]]
    (with-alert-setup
      [(api:alert-question-count :rasta card)
       (do
         (et/with-expected-messages 1
           ((alert-client :crowberto) :put 200 (alert-url alert)
            (assoc-in (default-alert-req card pc-1) [:channels 0 :enabled] false)))
         (api:alert-question-count :crowberto card))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"letting you know that Crowberto Corv" )])))

;; Re-enabling email should send users a subscribe notification
(expect
  [1
   1 ;;<-- Alert should not be deleted
   (et/email-to :rasta {:subject "Crowberto Corv added you to an alert",
                        :body    {"https://metabase.com/testmb"    true,
                                  "now getting alerts about .*Foo" true}})]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (basic-alert)]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc-1  (assoc (pulse-channel alert) :channel_type :email, :enabled false)]
                  PulseChannel          [pc-2  (assoc (pulse-channel alert) :channel_type :slack)]
                  PulseChannelRecipient [_     (recipient pc-1 :rasta)]]
    (with-alert-setup
      [(api:alert-question-count :rasta card)
       (do
         (et/with-expected-messages 1
           ((alert-client :crowberto) :put 200 (alert-url alert)
            (assoc-in (default-alert-req card pc-1) [:channels 0 :enabled] true)))
         (api:alert-question-count :crowberto card))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"now getting alerts about .*Foo" )])))

;; Alert should not be deleted if the unsubscriber isn't the creator
(expect
  [1
   1                                    ;<-- Alert should not be deleted
   (rasta-unsubscribe-email {"Foo" true})]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (assoc (basic-alert) :creator_id (user->id :crowberto))]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc-1  (assoc (pulse-channel alert) :channel_type :email)]
                  PulseChannel          [pc-2  (assoc (pulse-channel alert) :channel_type :slack)]
                  PulseChannelRecipient [_     (recipient pc-1 :rasta)]]
    (with-alert-setup
      [(api:alert-question-count :rasta card)
       (do
         (et/with-expected-messages 1
           (api:unsubscribe! :rasta 204 alert))
         (api:alert-question-count :crowberto card))
       (et/regex-email-bodies #"https://metabase.com/testmb"
                              #"Foo")])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             DELETE /api/alert/:id                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- api:delete! [user-kw expected-status-code alert-or-id]
  ((user->client user-kw) :delete expected-status-code (alert-url alert-or-id)))

;; Only admins can delete an alert
(expect
  [1 "You don't have permissions to do that."]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (basic-alert)]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [_     (recipient pc :rasta)]]
    (with-alert-setup
      [(api:alert-question-count :rasta card)
       (api:delete! :rasta 403 alert)])))

;; Testing a user can't delete an admin's alert
(expect
  [1 nil 0]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (basic-alert)]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [_     (recipient pc :rasta)]]
    (with-alert-setup
      (let [original-alert-response ((user->client :crowberto) :get 200 (alert-question-url card))]

        ;; A user can't delete an admin's alert
        (api:delete! :rasta 403 alert)

        [(count original-alert-response)
         (api:delete! :crowberto 204 alert)
         (api:alert-question-count :rasta card)]))))

;; An admin can delete a user's alert
(expect
  [1 nil 0
   (rasta-deleted-email {})]
  (tt/with-temp*  [Card                  [card  (basic-alert-query)]
                   Pulse                 [alert (basic-alert)]
                   PulseCard             [_     (pulse-card alert card)]
                   PulseChannel          [pc    (pulse-channel alert)]
                   PulseChannelRecipient [_     (recipient pc :rasta)]]
    (with-alert-setup
      [(api:alert-question-count :rasta card)
       (et/with-expected-messages 1
         (api:delete! :crowberto 204 alert))
       (api:alert-question-count :rasta card)
       (et/regex-email-bodies #"Crowberto Corv deleted an alert")])))

;; A deleted alert should notify the creator and any recipients
(expect
  [1 nil 0
   (merge
    (rasta-deleted-email {"Crowberto Corv unsubscribed you from alerts" false})
    (et/email-to :lucky {:subject "You’ve been unsubscribed from an alert",
                         :body    {"Crowberto Corv deleted an alert"             false
                                   "Crowberto Corv unsubscribed you from alerts" true}}))]
  (tt/with-temp*  [Card                  [card  (basic-alert-query)]
                   Pulse                 [alert (basic-alert)]
                   PulseCard             [_     (pulse-card alert card)]
                   PulseChannel          [pc    (pulse-channel alert)]
                   PulseChannelRecipient [_     (recipient pc :rasta)]
                   PulseChannelRecipient [_     (recipient pc :lucky)]]
    (with-alert-setup
      [(api:alert-question-count :rasta card)
       (et/with-expected-messages 2
         (api:delete! :crowberto 204 alert))
       (api:alert-question-count :rasta card)
       (et/regex-email-bodies #"Crowberto Corv deleted an alert"
                              #"Crowberto Corv unsubscribed you from alerts")])))

;; When an admin deletes their own alert, it should not notify them
(expect
  [1 nil 0 {}]
  (tt/with-temp* [Card                  [card  (basic-alert-query)]
                  Pulse                 [alert (assoc (basic-alert) :creator_id (user->id :crowberto))]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [_     (recipient pc :crowberto)]]
    (with-alert-setup
      [(api:alert-question-count :crowberto card)
       (api:delete! :crowberto 204 alert)
       (api:alert-question-count :crowberto card)
       (et/regex-email-bodies #".*")])))
