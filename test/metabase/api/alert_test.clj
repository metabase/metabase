(ns metabase.api.alert-test
  "Tests for `/api/alert` endpoints."
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [http-client :as http]
             [models :refer [Card Collection Pulse PulseCard PulseChannel PulseChannelRecipient]]
             [test :as mt]
             [util :as u]]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as group]
             [pulse :as pulse]
             [pulse-test :as pulse-test]]
            [metabase.test.mock.util :refer [pulse-channel-defaults]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- user-details [user-kwd]
  (-> user-kwd
      mt/fetch-user
      (select-keys [:email :first_name :is_qbnewb :is_superuser :last_name :common_name :locale])
      (assoc :id true, :date_joined true)))

(defn- pulse-card-details [card]
  (-> card
      (select-keys [:name :description :display])
      (update :display name)
      (update :collection_id boolean)
      (assoc :id true, :include_csv false, :include_xls false)))

(defn- recipient-details [user-kwd]
  (-> user-kwd
      user-details
      (dissoc :last_login :is_qbnewb :is_superuser :date_joined :locale)))

(defn- alert-client
  [username]
  (comp mt/boolean-ids-and-timestamps (partial mt/user-http-request username)))

(defn- default-email-channel
  ([pulse-card]
   (default-email-channel pulse-card [(mt/fetch-user :rasta)]))

  ([pulse-card recipients]
   {:id            pulse-card
    :enabled       true
    :channel_type  "email"
    :schedule_type "hourly"
    :schedule_hour 12
    :schedule_day  "mon"
    :recipients    recipients
    :details       {}}))

(defn- alert-response [response]
  (m/dissoc-in response [:creator :last_login]))

(defmacro ^:private with-test-email [& body]
  `(mt/with-temporary-setting-values [~'site-url "https://metabase.com/testmb"]
     (mt/with-fake-inbox
       ~@body)))

(defmacro ^:private with-alert-setup
  "Macro that will cleanup any created pulses and setups a fake-inbox to validate emails are sent for new alerts"
  [& body]
  `(mt/with-model-cleanup [Pulse]
     (with-test-email
       ~@body)))

(defn- do-with-alert-in-collection [f]
  (pulse-test/with-pulse-in-collection [db collection alert card]
    (assert (db/exists? PulseCard :card_id (u/get-id card), :pulse_id (u/get-id alert)))
    ;; Make this Alert actually be an alert
    (db/update! Pulse (u/get-id alert) :alert_condition "rows")
    (let [alert (db/select-one Pulse :id (u/get-id alert))]
      (assert (pulse/is-alert? alert))
      ;; Since Alerts do not actually go in Collections, but rather their Cards do, put the Card in the Collection
      (db/update! Card (u/get-id card) :collection_id (u/get-id collection))
      (let [card (db/select-one Card :id (u/get-id card))]
        (f db collection alert card)))))

(defmacro ^:private with-alert-in-collection
  "Do `body` with a temporary Alert whose Card is in a Collection, setting the stage to write various tests below. (Make
  sure to grant All Users permissions to the Collection if needed.)"
  {:style/indent 1}
  [[db-binding collection-binding alert-binding card-binding] & body]
  ;; I'm always getting the order of these two mixed up, so let's try to check that here
  (when alert-binding
    (assert (not= alert-binding 'card)))
  (when card-binding
    (assert (not= card-binding 'alert)))
  `(do-with-alert-in-collection
    (fn [~(or db-binding '_) ~(or collection-binding '_) ~(or alert-binding '_) ~(or card-binding '_)]
      ~@body)))

;; This stuff below is separate from `with-alert-in-collection` above!
(defn- do-with-alerts-in-a-collection
  "Do `f` with the Cards associated with `alerts-or-ids` in a new temporary Collection. Grant perms to All Users to that
  Collection using `f`.

  (The name of this function is somewhat of a misnomer since the Alerts themselves aren't in Collections; it is their
  Cards that are. Alerts do not go in Collections; their perms are derived from their Cards.)"
  [grant-collection-perms-fn! alerts-or-ids f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp Collection [collection]
      (grant-collection-perms-fn! (group/all-users) collection)
      ;; Go ahead and put all the Cards for all of the Alerts in the temp Collection
      (when (seq alerts-or-ids)
        (doseq [alert (db/select Pulse :id [:in (set (map u/get-id alerts-or-ids))])
                :let  [card (#'metabase.models.pulse/alert->card alert)]]
          (db/update! Card (u/get-id card) :collection_id (u/get-id collection))))
      (f))))

(defmacro ^:private with-alerts-in-readable-collection [alerts-or-ids & body]
  `(do-with-alerts-in-a-collection perms/grant-collection-read-permissions! ~alerts-or-ids (fn [] ~@body)))

(defmacro ^:private with-alerts-in-writeable-collection [alerts-or-ids & body]
  `(do-with-alerts-in-a-collection perms/grant-collection-readwrite-permissions! ~alerts-or-ids (fn [] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       /api/alert/* AUTHENTICATION Tests                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest api-alert-auth-tests
  (is (= (get middleware.u/response-unauthentic :body)
         (http/client :get 401 "alert")
         (http/client :put 401 "alert/13"))))

(deftest fetch-alerts-test
  (testing "GET /api/alert"
    (with-alert-in-collection [_ _ not-archived-alert]
      (with-alert-in-collection [_ _ archived-alert]
        (db/update! Pulse (u/get-id not-archived-alert) :name "Not Archived")
        (db/update! Pulse (u/get-id archived-alert)     :name "Archived", :archived true)
        (with-alerts-in-readable-collection [not-archived-alert archived-alert]
          (letfn [(alerts= [expected endpoint]
                    (let [response (mt/user-http-request :rasta :get 200 endpoint)]
                      (testing (format "\nResponse =\n%s" (u/pprint-to-str response))
                        (is (= expected
                               (set (map :name response)))))))]
            (testing "by default, archived Alerts should be excluded"
              (alerts= #{"Not Archived"}
                       "alert"))

            (testing "can we fetch archived Alerts?"
              (alerts= #{"Archived"}
                       "alert?archived=true"))))))))

(deftest fetch-alerts-ignore-invalid-test
  (testing "GET /api/alert"
    (testing "Should ignore Alerts that don't have a Card associated with them\n"
      (with-alert-in-collection [_ _ alert card]
        (with-alerts-in-readable-collection [alert]
          (testing "Sanity check: PulseCard should exist"
            (is (= true
                   (db/exists? PulseCard :card_id (u/get-id card), :pulse_id (u/get-id alert)))))
          (letfn [(alert-ids []
                    (set (map :id (mt/user-http-request :rasta :get 200 "alert"))))]
            (testing "Sanity check: Should be able to fetch Alert before deleting its Card"
              (is (contains? (alert-ids)
                             (:id alert))))
            (testing "Delete associated Card"
              (db/delete! Card :id (:id card))
              (is (= false
                     (db/exists? PulseCard :card_id (:id card), :pulse_id (:id alert)))))
            (testing "Alert shouldn't come back if it has no Card"
              (is (not (contains? (alert-ids)
                                  (:id alert)))))))))))

(deftest create-alert-parameter-validation-test
  (testing "POST /api/alert"
    (is (= {:errors {:alert_condition "value must be one of: `goal`, `rows`."}}
           (mt/user-http-request :rasta :post 400 "alert" {:alert_condition "not rows"
                                                           :card            "foobar"})))

    (is (= {:errors {:alert_first_only "value must be a boolean."}}
           (mt/user-http-request :rasta :post 400 "alert" {:alert_condition "rows"})))

    (is (= {:errors {:card "value must be a map with the keys `id`, `include_csv`, and `include_xls`."}}
           (mt/user-http-request :rasta :post 400 "alert" {:alert_condition  "rows"
                                                           :alert_first_only false})))

    (is (= {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
           (mt/user-http-request :rasta :post 400 "alert" {:alert_condition  "rows"
                                                           :alert_first_only false
                                                           :card             {:id          100
                                                                              :include_csv false
                                                                              :include_xls false}})))

    (is (= {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
           (mt/user-http-request :rasta :post 400 "alert" {:alert_condition  "rows"
                                                           :alert_first_only false
                                                           :card             {:id          100
                                                                              :include_csv false
                                                                              :include_xls false}
                                                           :channels         "foobar"})))

    (is (= {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}
           (mt/user-http-request :rasta :post 400 "alert" {:alert_condition  "rows"
                                                           :alert_first_only false
                                                           :card             {:id          100
                                                                              :include_csv false
                                                                              :include_xls false}
                                                           :channels         ["abc"]})))))

(defn- rasta-new-alert-email [body-map]
  (mt/email-to :rasta {:subject "You set up an alert",
                       :body (merge {"https://metabase.com/testmb" true,
                                     "My question" true}
                                    body-map)}))

(defn- rasta-added-to-alert-email [body-map]
  (mt/email-to :rasta {:subject "Crowberto Corv added you to an alert",
                       :body (merge {"https://metabase.com/testmb" true,
                                     "now getting alerts" true}
                                    body-map)}))

(defn- rasta-unsubscribe-email [body-map]
  (mt/email-to :rasta {:subject "You unsubscribed from an alert",
                       :body (merge {"https://metabase.com/testmb" true}
                                    body-map)}))

(defn- rasta-deleted-email [body-map]
  (mt/email-to :rasta {:subject "Crowberto Corv deleted an alert you created",
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
   :archived            false
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

(deftest new-rows-alert-email-notification-test
  (testing "POST /api/alert"
    (testing "Check creation of a new rows alert with email notification"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [collection]
                        Card       [card {:name "My question", :collection_id (:id collection)}]]
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
          (with-alert-setup
            (testing "API response"
              (is (= (-> (default-alert card)
                         (assoc-in [:card :include_csv] true)
                         (assoc-in [:card :collection_id] true)
                         (update-in [:channels 0] merge {:schedule_hour 12, :schedule_type "daily", :recipients []}))
                     (-> (mt/with-expected-messages 1
                           ((alert-client :rasta) :post 200 "alert"
                            {:card             {:id (u/get-id card), :include_csv false, :include_xls false}
                             :collection_id    (u/get-id collection)
                             :alert_condition  "rows"
                             :alert_first_only false
                             :channels         [daily-email-channel]}))
                         alert-response))))
            (testing "emails"
              (is (= (rasta-new-alert-email {"has any results" true})
                     (mt/regex-email-bodies #"https://metabase.com/testmb"
                                            #"has any results"
                                            #"My question"))))))))))

(defn- setify-recipient-emails [results]
  (update results :channels (fn [channels]
                              (map #(update % :recipients set) channels))))

(deftest subscription-notification-test
  (testing "POST /api/alert"
    (testing "An admin created alert should notify others they've been subscribed"
      (mt/with-temp Card [card {:name "My question"}]
        (with-alert-setup
          (testing "API response"
            (is (= (-> (default-alert card)
                       (assoc :creator (user-details :crowberto))
                       (assoc-in [:card :include_csv] true)
                       (update-in [:channels 0] merge {:schedule_hour 12
                                                       :schedule_type "daily"
                                                       :recipients    (set (map recipient-details [:rasta :crowberto]))}))
                   (mt/with-expected-messages 2
                     (-> (-> ((alert-client :crowberto) :post 200 "alert"
                              {:card             {:id          (u/get-id card)
                                                  :include_csv false
                                                  :include_xls false}
                               :alert_condition  "rows"
                               :alert_first_only false
                               :channels         [(assoc daily-email-channel
                                                         :details {:emails nil}
                                                         :recipients (mapv mt/fetch-user [:crowberto :rasta]))]})
                             setify-recipient-emails)
                         alert-response)))))
          (testing "emails"
            (is (= (merge (mt/email-to :crowberto
                                       {:subject "You set up an alert"
                                        :body    {"https://metabase.com/testmb"  true
                                                  "My question"                  true
                                                  "now getting alerts"           false
                                                  "confirmation that your alert" true}})
                          (rasta-added-to-alert-email
                           {"My question" true, "now getting alerts" true, "confirmation that your alert" false}))
                   (mt/regex-email-bodies
                    #"https://metabase.com/testmb"
                    #"now getting alerts"
                    #"confirmation that your alert"
                    #"My question")))))))))


(deftest below-goal-alert-test
  (testing "Check creation of a below goal alert"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [collection]
                      Card       [card {:name          "My question"
                                        :display       "line"
                                        :collection_id (u/get-id collection)}]]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        (with-alert-setup
          (mt/with-expected-messages 1
            (mt/user-http-request :rasta :post 200 "alert"
                                  {:card             {:id (u/get-id card), :include_csv false, :include_xls false}
                                   :alert_condition  "goal"
                                   :alert_above_goal false
                                   :alert_first_only false
                                   :channels         [daily-email-channel]}))
          (is (= (rasta-new-alert-email {"goes below its goal" true})
                 (mt/regex-email-bodies #"https://metabase.com/testmb"
                                        #"goes below its goal"
                                        #"My question"))))))))

(deftest above-goal-alert-test
  (testing "POST /api/alert"
    (testing "Check creation of a above goal alert"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [collection]
                        Card       [card {:name          "My question"
                                          :display       "bar"
                                          :collection_id (u/get-id collection)}]]
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
          (with-alert-setup
            (mt/with-expected-messages 1
              (mt/user-http-request :rasta :post 200 "alert"
                                    {:card             {:id (u/get-id card), :include_csv false, :include_xls false}
                                     :collection_id    (u/get-id collection)
                                     :alert_condition  "goal"
                                     :alert_above_goal true
                                     :alert_first_only false
                                     :channels         [daily-email-channel]}))
            (is (= (rasta-new-alert-email {"meets its goal" true})
                   (mt/regex-email-bodies #"https://metabase.com/testmb"
                                          #"meets its goal"
                                          #"My question")))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PUT /api/alert/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-alert-parameter-validation-test
  (testing "PUT /api/alert/:id"
    (is (= {:errors {:alert_condition "value may be nil, or if non-nil, value must be one of: `goal`, `rows`."}}
           (mt/user-http-request :rasta :put 400 "alert/1" {:alert_condition "not rows"})))

    (is (= {:errors {:alert_first_only "value may be nil, or if non-nil, value must be a boolean."}}
           (mt/user-http-request :rasta :put 400 "alert/1" {:alert_first_only 1000})))

    (is (= {:errors {:card (str "value may be nil, or if non-nil, value must be a map with the keys `id`, "
                                "`include_csv`, and `include_xls`.")}}
           (mt/user-http-request :rasta :put 400 "alert/1" {:alert_condition  "rows"
                                                            :alert_first_only false
                                                            :card             "foobar"})))

    (is (= {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a "
                                    "map. The array cannot be empty.")}}
           (mt/user-http-request :rasta :put 400 "alert/1" {:alert_condition  "rows"
                                                            :alert_first_only false
                                                            :card             {:id          100
                                                                               :include_csv false
                                                                               :include_xls false}
                                                            :channels         "foobar"})))

    (is (= {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a "
                                    "map. The array cannot be empty.")}}
           (mt/user-http-request :rasta :put 400 "alert/1" {:name             "abc"
                                                            :alert_condition  "rows"
                                                            :alert_first_only false
                                                            :card             {:id 100
                                                                               :include_csv false
                                                                               :include_xls false}
                                                            :channels         ["abc"]})))))

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
   :creator_id       (mt/user->id :rasta)
   :name             nil})

(defn- recipient [pulse-channel-or-id username-keyword]
  (let [user (mt/fetch-user username-keyword)]
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

(deftest non-admin-update-alert-test
  (testing "Non-admin Users can update Alerts they created *if* they are in the recipient list"
    (mt/with-temp* [Pulse                 [alert (basic-alert)]
                    Card                  [card]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc    (pulse-channel alert)]
                    PulseChannelRecipient [_     (recipient pc :rasta)]]
      (with-alerts-in-writeable-collection [alert]
        (mt/with-model-cleanup [Pulse]
          (is (= (-> (default-alert card)
                     (assoc-in [:card :collection_id] true))
                 (-> ((alert-client :rasta) :put 200 (alert-url alert)
                      (default-alert-req card pc))
                     alert-response))))))))

(deftest admin-update-alert-test
  (mt/with-temp* [Pulse                 [alert (basic-alert)]
                  Card                  [card]
                  PulseCard             [_     (pulse-card alert card)]
                  PulseChannel          [pc    (pulse-channel alert)]
                  PulseChannelRecipient [_     (recipient pc :rasta)]]
    (testing "Admin Users can update any Alert"
      (is (= (default-alert card)
             (-> ((alert-client :crowberto) :put 200 (alert-url alert)
                  (default-alert-req card pc))
                 alert-response))))

    (testing "Admin Users can update any Alert, changing the related Alert attributes"
      (is (= (assoc (default-alert card)
                    :alert_first_only true
                    :alert_above_goal true
                    :alert_condition  "goal")
             (-> ((alert-client :crowberto) :put 200 (alert-url alert)
                  (default-alert-req card (u/get-id pc) {:alert_first_only true
                                                         :alert_above_goal true
                                                         :alert_condition  "goal"}
                                     [(mt/fetch-user :rasta)]))
                 alert-response))))))

(deftest admin-add-recipient-test
  (testing "Admin users can add a recipieint, that recipient should be notified"
    (mt/with-temp* [Pulse                 [alert (basic-alert)]
                    Card                  [card]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc    (pulse-channel alert)]
                    PulseChannelRecipient [_     (recipient pc :crowberto)]]
      (with-alert-setup
        (testing "API response"
          (is (= (-> (default-alert card)
                     (assoc-in [:channels 0 :recipients] (set (map recipient-details [:crowberto :rasta]))))
                 (-> (mt/with-expected-messages 1
                       (setify-recipient-emails
                        ((alert-client :crowberto) :put 200 (alert-url alert)
                         (default-alert-req card pc {} [(mt/fetch-user :crowberto)
                                                        (mt/fetch-user :rasta)]))))
                     alert-response))))
        (testing "emails"
          (is (= (mt/email-to :rasta {:subject "Crowberto Corv added you to an alert"
                                      :body    {"https://metabase.com/testmb" true, "now getting alerts" true}})
                 (mt/regex-email-bodies #"https://metabase.com/testmb"
                                        #"now getting alerts"))))))))

(deftest admin-users-remove-recipient-test
  (testing "PUT /api/alert/:id"
    (testing "admin users can remove a recipieint, that recipient should be notified"
      (mt/with-temp* [Pulse                 [alert (basic-alert)]
                      Card                  [card]
                      PulseCard             [_     (pulse-card alert card)]
                      PulseChannel          [pc    (pulse-channel alert)]
                      PulseChannelRecipient [_     (recipient pc :crowberto)]
                      PulseChannelRecipient [_     (recipient pc :rasta)]]
        (with-alert-setup
          (testing "API response"
            (is (= (-> (default-alert card)
                       (assoc-in [:channels 0 :recipients] [(recipient-details :crowberto)]))
                   (-> (mt/with-expected-messages 1
                         ((alert-client :crowberto) :put 200 (alert-url alert)
                          (default-alert-req card (u/get-id pc) {} [(mt/fetch-user :crowberto)])))
                       alert-response))))
          (testing "emails"
            (is (= (mt/email-to :rasta {:subject "You’ve been unsubscribed from an alert"
                                        :body    {"https://metabase.com/testmb"          true
                                                  "letting you know that Crowberto Corv" true}})
                   (mt/regex-email-bodies #"https://metabase.com/testmb"
                                          #"letting you know that Crowberto Corv")))))))))

(deftest non-admin-edit-perms-test
  (testing "Non-admin users can't edit alerts they didn't create"
    (mt/with-temp* [Pulse                 [alert (assoc (basic-alert) :creator_id (mt/user->id :crowberto))]
                    Card                  [card]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc    (pulse-channel alert)]
                    PulseChannelRecipient [_     (recipient pc :rasta)]]
      (mt/with-non-admin-groups-no-root-collection-perms
        (with-alert-setup
          (is (= "You don't have permissions to do that."
                 ((alert-client :rasta) :put 403 (alert-url alert)
                  (default-alert-req card pc))))))))

  (testing "Non-admin users can't edit alerts if they're not in the recipient list"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Pulse                 [alert (basic-alert)]
                      Card                  [card]
                      PulseCard             [_     (pulse-card alert card)]
                      PulseChannel          [pc    (pulse-channel alert)]
                      PulseChannelRecipient [_     (recipient pc :crowberto)]]
        (with-alert-setup
          (is (= "You don't have permissions to do that."
                 ((alert-client :rasta) :put 403 (alert-url alert)
                  (default-alert-req card pc)))))))))

(deftest change-alert-card-test
  (testing "PUT /api/alert/:id"
    (testing "Should be able to change the Card associated with an alert"
      (with-alert-in-collection [_ collection alert card]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        (letfn [(alert-card-name []
                  (-> (pulse/retrieve-alert alert) :card :name))]
          (testing "Sanity check: Alert should have the Card we expected"
            (is (= (:name card)
                   (alert-card-name))))
          (mt/with-temp Card [new-card {:collection_id (:id collection)}]
            (testing "Change the Alert Card via the API"
              (is (schema= {:archived (s/eq false)
                            :id       (s/eq (u/get-id alert))
                            s/Keyword s/Any}
                           (mt/user-http-request :rasta :put 200 (str "alert/" (u/get-id alert))
                                                 {:card {:id          (:id new-card)
                                                         :include_csv false
                                                         :include_xls false}}))))
            (testing "Alert should have new Card associated with it"
              (is (= (:name new-card)
                     (alert-card-name))))))))))

(deftest archive-alert-test
  (testing "PUT /api/alert/:id"
    (with-alert-in-collection [_ _ alert card]
      (with-alerts-in-writeable-collection [alert]
        (letfn [(alert-card-name []
                  (-> (pulse/retrieve-alert alert) :card :name))]
          (testing "Sanity check: Alert should have expected Card associated with it"
            (is (= (:name card)
                   (alert-card-name))))
          (testing "Can we archive an Alert?"
            (is (schema= {:archived (s/eq true)
                          :id       (s/eq (u/get-id alert))
                          s/Keyword s/Any}
                         (mt/user-http-request :rasta :put 200 (str "alert/" (u/get-id alert))
                                               {:archived true})))
            (testing "Sanity check: Alert should still have original Card associated with it"
              (is (= (:name card)
                     (alert-card-name))))
            (testing "Alert should be archived"
              (is (= true
                     (db/select-one-field :archived Pulse :id (u/get-id alert))))))
          (testing "Can we unarchive an Alert?"
            (is (schema= {:archived (s/eq false)
                          :id       (s/eq (u/get-id alert))
                          s/Keyword s/Any}
                         (mt/user-http-request :rasta :put 200 (str "alert/" (u/get-id alert))
                                               {:archived false})))
            (testing "Alert should *still* have original Card associated with it"
              (is (= (:name card)
                     (alert-card-name))))
            (testing "Alert should be unarchived"
              (is (= false
                     (db/select-one-field :archived Pulse :id (u/get-id alert)))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            GET /alert/question/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- basic-alert-query []
  {:name          "Foo"
   :dataset_query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id :checkins)
                              :aggregation  [["count"]]
                              :breakout     [["datetime-field" (mt/id :checkins :date) "hour"]]}}})

(defn- alert-question-url [card-or-id]
  (format "alert/question/%d" (u/get-id card-or-id)))

(defn- api:alert-question-count [user-kw card-or-id]
  (count ((alert-client user-kw) :get 200 (alert-question-url card-or-id))))

(deftest fetch-alert-test
  (testing "GET /api/alert/question/:card-id"
    (mt/with-temp* [Card                 [card  (basic-alert-query)]
                    Pulse                [alert {:alert_condition  "rows"
                                                 :alert_first_only false
                                                 :alert_above_goal nil
                                                 :skip_if_empty    true
                                                 :name             nil}]
                    PulseCard             [_    (pulse-card alert card)]
                    PulseChannel          [pc   (pulse-channel alert)]
                    PulseChannelRecipient [_    (recipient pc :rasta)]]
      (mt/with-non-admin-groups-no-root-collection-perms
        (with-alert-setup
          (with-alerts-in-readable-collection [alert]
            (testing "API response"
              (is (= [(-> (default-alert card)
                          (assoc :can_write false)
                          (update-in [:channels 0] merge {:schedule_hour 15, :schedule_type "daily"})
                          (assoc-in [:card :collection_id] true))]
                     (map alert-response
                          ((alert-client :rasta) :get 200 (alert-question-url card))))))))))))

(deftest non-admin-users-shouldnt-see-alerts-they-dont-recieve-test
  (testing "Non-admin users shouldn't see alerts they created if they're no longer recipients"
    (mt/with-temp* [Card                  [card  (basic-alert-query)]
                    Pulse                 [alert (assoc (basic-alert) :alert_above_goal true)]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc    (pulse-channel alert)]
                    PulseChannelRecipient [pcr   (recipient pc :rasta)]
                    PulseChannelRecipient [_     (recipient pc :crowberto)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= 1
                 (count ((alert-client :rasta) :get 200 (alert-question-url card)))))
          (db/delete! PulseChannelRecipient :id (u/get-id pcr))
          (is (= 0
                 (api:alert-question-count :rasta card))))))))

(deftest admins-see-all-alerts-test
  (testing "Non-admin users should not see others alerts, admins see all alerts"
    (mt/with-temp* [Card                  [card    (basic-alert-query)]
                    Pulse                 [alert-1 (assoc (basic-alert)
                                                          :alert_above_goal false)]
                    PulseCard             [_       (pulse-card alert-1 card)]
                    PulseChannel          [pc-1    (pulse-channel alert-1)]
                    PulseChannelRecipient [_       (recipient pc-1 :rasta)]
                    ;; A separate admin created alert
                    Pulse                 [alert-2 (assoc (basic-alert)
                                                          :alert_above_goal false
                                                          :creator_id       (mt/user->id :crowberto))]
                    PulseCard             [_       (pulse-card alert-2 card)]
                    PulseChannel          [pc-2    (pulse-channel alert-2)]
                    PulseChannelRecipient [_       (recipient pc-2 :crowberto)]
                    PulseChannel          [_       (assoc (pulse-channel alert-2) :channel_type "slack")]]
      (with-alerts-in-readable-collection [alert-1 alert-2]
        (with-alert-setup
          (is (= 1
                 (api:alert-question-count :rasta     card)))
          (is (= 2
                 (api:alert-question-count :crowberto card))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         PUT /api/alert/:id/unsubscribe                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- alert-unsubscribe-url [alert-or-id]
  (format "alert/%d/unsubscribe" (u/get-id alert-or-id)))

(defn- api:unsubscribe! [user-kw expected-status-code alert-or-id]
  (mt/user-http-request user-kw :put expected-status-code (alert-unsubscribe-url alert-or-id)))

(deftest admin-user-cannot-unsubscribe-test
  (is (= "Admin users are not allowed to unsubscribe from alerts"
         (api:unsubscribe! :crowberto 400 1))))

(defn- recipient-emails [results]
  (->> results
       first
       :channels
       first
       :recipients
       (map :email)
       set))

(deftest unsubscribe-test
  (testing "Alert has two recipients, remove one"
    (mt/with-temp* [Card                  [card  (basic-alert-query)]
                    Pulse                 [alert (basic-alert)]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc    (pulse-channel alert)]
                    PulseChannelRecipient [_     (recipient pc :rasta)]
                    PulseChannelRecipient [_     (recipient pc :crowberto)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= #{"crowberto@metabase.com" "rasta@metabase.com"}
                 (recipient-emails (mt/user-http-request :rasta :get 200 (alert-question-url card)))))
          (mt/with-expected-messages 1 (api:unsubscribe! :rasta 204 alert))
          (is (= #{"crowberto@metabase.com"}
                 (recipient-emails (mt/user-http-request :crowberto :get 200 (alert-question-url card)))))
          (is (= (rasta-unsubscribe-email {"Foo" true})
                 (mt/regex-email-bodies #"https://metabase.com/testmb" #"Foo"))))))))

(deftest delete-alert-when-creator-unsubscribes-test
  (testing "Alert should be deleted if the creator unsubscribes and there's no one left"
    (mt/with-temp* [Card                  [card  (basic-alert-query)]
                    Pulse                 [alert (basic-alert)]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc    (pulse-channel alert)]
                    PulseChannelRecipient [_     (recipient pc :rasta)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= 1
                 (api:alert-question-count :rasta card)))
          (mt/with-expected-messages 1 (api:unsubscribe! :rasta 204 alert))
          (is (= 0
                 (api:alert-question-count :crowberto card)))
          (is (= (rasta-unsubscribe-email {"Foo" true})
                 (mt/regex-email-bodies #"https://metabase.com/testmb" #"Foo"))))))))

(deftest do-not-delete-alert-with-slack-channel-test
  (testing "Alert should not be deleted if there is a slack channel"
    (mt/with-temp* [Card                  [card  (basic-alert-query)]
                    Pulse                 [alert (basic-alert)]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc-1  (assoc (pulse-channel alert) :channel_type :email)]
                    PulseChannel          [_     (assoc (pulse-channel alert) :channel_type :slack)]
                    PulseChannelRecipient [_     (recipient pc-1 :rasta)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= 1
                 (api:alert-question-count :rasta card)))
          (mt/with-expected-messages 1 (api:unsubscribe! :rasta 204 alert))
          (is (= 1
                 (api:alert-question-count :crowberto card)))
          (is (= (rasta-unsubscribe-email {"Foo" true})
                 (mt/regex-email-bodies #"https://metabase.com/testmb" #"Foo"))))))))

(deftest disable-email-unsubscribe-test
  (testing "If email is disabled, users should be unsubscribed"
    (mt/with-temp* [Card                  [card  (basic-alert-query)]
                    Pulse                 [alert (basic-alert)]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc-1  (assoc (pulse-channel alert) :channel_type :email)]
                    PulseChannel          [pc-2  (assoc (pulse-channel alert) :channel_type :slack)]
                    PulseChannelRecipient [_     (recipient pc-1 :rasta)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= 1
                 (api:alert-question-count :rasta card)))
          (mt/with-expected-messages 1 ((alert-client :crowberto) :put 200
                                        (alert-url alert)
                                        (assoc-in (default-alert-req card pc-1) [:channels 0 :enabled] false)))
          (is (= 1
                 (api:alert-question-count :crowberto card)))
          (is (= (mt/email-to :rasta {:subject "You’ve been unsubscribed from an alert",
                                      :body    {"https://metabase.com/testmb"          true
                                                "letting you know that Crowberto Corv" true}})
                 (mt/regex-email-bodies #"https://metabase.com/testmb" #"letting you know that Crowberto Corv"))))))))

(deftest reenable-subscribe-notification-test
  (testing "Re-enabling email should send users a subscribe notification"
    (mt/with-temp* [Card                  [card  (basic-alert-query)]
                    Pulse                 [alert (basic-alert)]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc-1  (assoc (pulse-channel alert) :channel_type :email, :enabled false)]
                    PulseChannel          [pc-2  (assoc (pulse-channel alert) :channel_type :slack)]
                    PulseChannelRecipient [_     (recipient pc-1 :rasta)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= 1
                 (api:alert-question-count :rasta card)))
          (mt/with-expected-messages 1 ((alert-client :crowberto) :put 200 (alert-url alert)
                                        (assoc-in (default-alert-req card pc-1) [:channels 0 :enabled] true)))
          (is (= 1
                 (api:alert-question-count :crowberto card)))
          (is (= (mt/email-to :rasta {:subject "Crowberto Corv added you to an alert",
                                      :body {"https://metabase.com/testmb" true, "now getting alerts about .*Foo" true}})
                 (mt/regex-email-bodies #"https://metabase.com/testmb" #"now getting alerts about .*Foo"))))))))

(deftest do-not-delete-alert-if-unsubscriber-is-not-creator-test
  (testing "Alert should not be deleted if the unsubscriber isn't the creator"
    (mt/with-temp* [Card                  [card  (basic-alert-query)]
                    Pulse                 [alert (assoc (basic-alert) :creator_id (mt/user->id :crowberto))]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc-1  (assoc (pulse-channel alert) :channel_type :email)]
                    PulseChannel          [pc-2  (assoc (pulse-channel alert) :channel_type :slack)]
                    PulseChannelRecipient [_     (recipient pc-1 :rasta)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= 1
                 (api:alert-question-count :rasta card)))
          (mt/with-expected-messages 1 (api:unsubscribe! :rasta 204 alert))
          (is (= 1
                 (api:alert-question-count :crowberto card)))
          (is (= (rasta-unsubscribe-email {"Foo" true})
                 (mt/regex-email-bodies #"https://metabase.com/testmb" #"Foo"))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             DELETE /api/alert/:id                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- api:delete! [user-kw expected-status-code alert-or-id]
  (mt/user-http-request user-kw :delete expected-status-code (alert-url alert-or-id)))

(deftest only-admins-can-delete-alert-test
  (testing "Only admins can delete an alert"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Card                  [card  (basic-alert-query)]
                      Pulse                 [alert (basic-alert)]
                      PulseCard             [_     (pulse-card alert card)]
                      PulseChannel          [pc    (pulse-channel alert)]
                      PulseChannelRecipient [_     (recipient pc :rasta)]]
        (with-alerts-in-readable-collection [alert]
          (with-alert-setup
            (is (= 1
                   (api:alert-question-count :rasta card)))
            (is (= "You don't have permissions to do that."
                   (api:delete! :rasta 403 alert)))
            (is (= 1
                   (count (mt/user-http-request :crowberto :get 200 (alert-question-url card)))))
            (is (= nil
                   (api:delete! :crowberto 204 alert)))
            (is (= 0
                   (api:alert-question-count :rasta card)))))))))

(deftest admin-delete-other-users-alert-test
  (testing "An admin can delete a different user's alert"
    (mt/with-temp*  [Card                  [card  (basic-alert-query)]
                     Pulse                 [alert (basic-alert)]
                     PulseCard             [_     (pulse-card alert card)]
                     PulseChannel          [pc    (pulse-channel alert)]
                     PulseChannelRecipient [_     (recipient pc :rasta)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= 1
                 (api:alert-question-count :rasta card)))
          (is (= nil
                 (mt/with-expected-messages 1 (api:delete! :crowberto 204 alert))))
          (is (= 0
                 (api:alert-question-count :rasta card)))
          (is (= (rasta-deleted-email {})
                 (mt/regex-email-bodies #"Crowberto Corv deleted an alert"))))))))

(deftest notify-when-alert-is-deleted-test
  (testing "A deleted alert should notify the creator and any recipients"
    (mt/with-temp*  [Card                  [card  (basic-alert-query)]
                     Pulse                 [alert (basic-alert)]
                     PulseCard             [_     (pulse-card alert card)]
                     PulseChannel          [pc    (pulse-channel alert)]
                     PulseChannelRecipient [_     (recipient pc :rasta)]
                     PulseChannelRecipient [_     (recipient pc :lucky)]]
      (with-alerts-in-readable-collection [alert]
        (with-alert-setup
          (is (= 1
                 (api:alert-question-count :rasta card)))
          (is (= nil
                 (mt/with-expected-messages 2 (api:delete! :crowberto 204 alert))))
          (is (= 0
                 (api:alert-question-count :rasta card)))
          (is (= (merge
                  (rasta-deleted-email {"Crowberto Corv unsubscribed you from alerts" false})
                  (mt/email-to
                   :lucky
                   {:subject "You’ve been unsubscribed from an alert"
                    :body    {"Crowberto Corv deleted an alert"             false
                              "Crowberto Corv unsubscribed you from alerts" true}}))
                 (mt/regex-email-bodies #"Crowberto Corv deleted an alert" #"Crowberto Corv unsubscribed you from alerts")))))))

  (testing "When an admin deletes their own alert, it should not notify them"
    (mt/with-temp* [Card                  [card  (basic-alert-query)]
                    Pulse                 [alert (assoc (basic-alert) :creator_id (mt/user->id :crowberto))]
                    PulseCard             [_     (pulse-card alert card)]
                    PulseChannel          [pc    (pulse-channel alert)]
                    PulseChannelRecipient [_     (recipient pc :crowberto)]]
      (with-alert-setup
        (is (= 1
               (api:alert-question-count :crowberto card)))
        (is (= nil
               (api:delete! :crowberto 204 alert)))
        (is (= 0
               (api:alert-question-count :crowberto card)))
        (is (= {}
               (mt/regex-email-bodies #".*")))))))
