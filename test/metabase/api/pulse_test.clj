(ns metabase.api.pulse-test
  "Tests for /api/pulse endpoints."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.card-test :as api.card-test]
   [metabase.api.pulse :as api.pulse]
   [metabase.http-client :as client]
   [metabase.integrations.slack :as slack]
   [metabase.models
    :refer [Card
            Collection
            Dashboard
            DashboardCard
            Pulse
            PulseCard
            PulseChannel
            PulseChannelRecipient]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.pulse-channel :as pulse-channel]
   [metabase.models.pulse-test :as pulse-test]
   [metabase.pulse.render.style :as style]
   [metabase.server.request.util :as req.util]
   [metabase.test :as mt]
   [metabase.test.mock.util :refer [pulse-channel-defaults]]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- user-details [user]
  (select-keys
   user
   [:email :first_name :last_login :is_qbnewb :is_superuser :id :last_name :date_joined :common_name :locale]))

(defn- pulse-card-details [card]
  (-> (select-keys card [:id :collection_id :name :description :display])
      (update :display name)
      (update :collection_id boolean)
      ;; why? these fields in this last assoc are from the PulseCard model and this function takes the Card model
      ;; because PulseCard is somewhat hidden behind the scenes
      (assoc :include_csv false, :include_xls false, :dashboard_card_id nil, :dashboard_id nil, :format_rows true
             :parameter_mappings nil)))

(defn- pulse-channel-details [channel]
  (select-keys channel [:schedule_type :schedule_details :channel_type :updated_at :details :pulse_id :id :enabled
                        :created_at]))

(defn- pulse-details [pulse]
  (merge
   (select-keys
    pulse
    [:id :name :created_at :updated_at :creator_id :collection_id :collection_position :entity_id :archived
     :skip_if_empty :dashboard_id :parameters])
   {:creator  (user-details (t2/select-one 'User :id (:creator_id pulse)))
    :cards    (map pulse-card-details (:cards pulse))
    :channels (map pulse-channel-details (:channels pulse))}))

(defn- pulse-response [{:keys [created_at updated_at], :as pulse}]
  (-> pulse
      (dissoc :id)
      (assoc :created_at (some? created_at)
             :updated_at (some? updated_at))
      (update :collection_id boolean)
      (update :entity_id boolean)
      (update :cards #(for [card %]
                        (update card :collection_id boolean)))))

(defn- do-with-pulses-in-a-collection [grant-collection-perms-fn! pulses-or-ids f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (t2.with-temp/with-temp [Collection collection]
      (grant-collection-perms-fn! (perms-group/all-users) collection)
      ;; use db/execute! instead of t2/update! so the updated_at field doesn't get automatically updated!
      (when (seq pulses-or-ids)
        (t2/query-one {:update :pulse
                       :set    {:collection_id (u/the-id collection)}
                       :where  [:in :id (set (map u/the-id pulses-or-ids))]}))
      (f))))

(defmacro ^:private with-pulses-in-nonreadable-collection [pulses-or-ids & body]
  `(do-with-pulses-in-a-collection (constantly nil) ~pulses-or-ids (fn [] ~@body)))

(defmacro ^:private with-pulses-in-readable-collection [pulses-or-ids & body]
  `(do-with-pulses-in-a-collection perms/grant-collection-read-permissions! ~pulses-or-ids (fn [] ~@body)))

(defmacro ^:private with-pulses-in-writeable-collection [pulses-or-ids & body]
  `(do-with-pulses-in-a-collection perms/grant-collection-readwrite-permissions! ~pulses-or-ids (fn [] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       /api/pulse/* AUTHENTICATION Tests                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest authentication-test
  (is (= (:body req.util/response-unauthentic) (client/client :get 401 "pulse")))
  (is (= (:body req.util/response-unauthentic) (client/client :put 401 "pulse/13"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                POST /api/pulse                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private default-post-card-ref-validation-error
  {:errors
   {:cards (str "one or more value must be a map with the following keys "
                "`(collection_id, description, display, id, include_csv, include_xls, name, dashboard_id, parameter_mappings)`, "
                "or value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`., "
                "or value must be a map with the keys `include_csv`, `include_xls`, and `dashboard_card_id`.")}})

(deftest create-pulse-validation-test
  (doseq [[input expected-error]
          {{}
           {:errors {:name "value must be a non-blank string."}
            :specific-errors {:name ["should be a string, received: nil" "non-blank string, received: nil"]}}

           {:name "abc"}
           default-post-card-ref-validation-error

           {:name  "abc"
            :cards "foobar"}
           default-post-card-ref-validation-error

           {:name  "abc"
            :cards ["abc"]}
           default-post-card-ref-validation-error

           {:name  "abc"
            :cards [{:id 100, :include_csv false, :include_xls false, :dashboard_card_id nil}
                    {:id 200, :include_csv false, :include_xls false, :dashboard_card_id nil}]}
           {:errors {:channels "one or more map"}}

           {:name     "abc"
            :cards    [{:id 100, :include_csv false, :include_xls false, :dashboard_card_id nil}
                       {:id 200, :include_csv false, :include_xls false, :dashboard_card_id nil}]
            :channels "foobar"}
           {:errors {:channels "one or more map"}}

           {:name     "abc"
            :cards    [{:id 100, :include_csv false, :include_xls false, :dashboard_card_id nil}
                       {:id 200, :include_csv false, :include_xls false, :dashboard_card_id nil}]
            :channels ["abc"]}
           {:errors {:channels "one or more map"}}}]
    (testing (pr-str input)
      (is (=? expected-error
              (mt/user-http-request :rasta :post 400 "pulse" input))))))

(defn- remove-extra-channels-fields [channels]
  (for [channel channels]
    (-> channel
        (dissoc :id :pulse_id :created_at :updated_at)
        (update :entity_id boolean))))

(def ^:private pulse-defaults
  {:collection_id       nil
   :collection_position nil
   :created_at          true
   :skip_if_empty       false
   :updated_at          true
   :archived            false
   :dashboard_id        nil
   :entity_id           true
   :parameters          []})

(def ^:private daily-email-channel
  {:enabled       true
   :channel_type  "email"
   :schedule_type "daily"
   :schedule_hour 12
   :schedule_day  nil
   :recipients    []})

(deftest create-test
  (testing "POST /api/pulse"
    (testing "legacy pulse"
      (mt/with-temp [Card card-1 {}
                     Card card-2 {}
                     Dashboard _ {:name "Birdcage KPIs"}
                     Collection collection {}]
        (api.card-test/with-cards-in-readable-collection [card-1 card-2]
          (mt/with-model-cleanup [Pulse]
            (is (= (merge
                    pulse-defaults
                    {:name          "A Pulse"
                     :creator_id    (mt/user->id :rasta)
                     :creator       (user-details (mt/fetch-user :rasta))
                     :cards         (for [card [card-1 card-2]]
                                      (assoc (pulse-card-details card)
                                             :collection_id true))
                     :channels      [(merge pulse-channel-defaults
                                            {:channel_type  "email"
                                             :schedule_type "daily"
                                             :schedule_hour 12
                                             :recipients    []})]
                     :collection_id true})
                   (-> (mt/user-http-request :rasta :post 200 "pulse" {:name          "A Pulse"
                                                                       :collection_id (u/the-id collection)
                                                                       :cards         [{:id                (u/the-id card-1)
                                                                                        :include_csv       false
                                                                                        :include_xls       false
                                                                                        :dashboard_card_id nil}
                                                                                       {:id                (u/the-id card-2)
                                                                                        :include_csv       false
                                                                                        :include_xls       false
                                                                                        :dashboard_card_id nil}]
                                                                       :channels      [daily-email-channel]
                                                                       :skip_if_empty false})
                       pulse-response
                       (update :channels remove-extra-channels-fields))))))))
    (testing "dashboard subscriptions"
      (mt/with-temp
        [Collection collection                   {}
         Card       card-1                       {}
         Card       card-2                       {}
         Dashboard  {permitted-dashboard-id :id} {:name "Birdcage KPIs" :collection_id (u/the-id collection)}
         Dashboard  {blocked-dashboard-id :id}   {:name "[redacted]"}]
        (let [filter-params [{:id "abc123" :name "test" :type "date"}]
              payload       {:name          "A Pulse"
                             :collection_id (u/the-id collection)
                             :cards         [{:id                (u/the-id card-1)
                                              :include_csv       false
                                              :include_xls       false
                                              :dashboard_card_id nil}
                                             {:id                (u/the-id card-2)
                                              :include_csv       false
                                              :include_xls       false
                                              :dashboard_card_id nil}]
                             :channels      [daily-email-channel]
                             :dashboard_id  permitted-dashboard-id
                             :skip_if_empty false
                             :parameters filter-params}]
          (api.card-test/with-cards-in-readable-collection [card-1 card-2]
            (mt/with-model-cleanup [Pulse]
              (testing "successful creation"
                (is (= (merge
                        pulse-defaults
                        {:name          "A Pulse"
                         :creator_id    (mt/user->id :rasta)
                         :creator       (user-details (mt/fetch-user :rasta))
                         :cards         (for [card [card-1 card-2]]
                                          (assoc (pulse-card-details card)
                                                 :collection_id true))
                         :channels      [(merge pulse-channel-defaults
                                                {:channel_type  "email"
                                                 :schedule_type "daily"
                                                 :schedule_hour 12
                                                 :recipients    []})]
                         :collection_id true
                         :dashboard_id  permitted-dashboard-id
                         :parameters  filter-params})
                       (-> (mt/user-http-request :rasta :post 200 "pulse" payload)
                           pulse-response
                           (update :channels remove-extra-channels-fields)))))
              (testing "authorization"
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :post 403 "pulse" (assoc payload :dashboard_id blocked-dashboard-id))))))))))))

(deftest create-with-hybrid-pulse-card-test
  (testing "POST /api/pulse"
    (testing "Create a pulse with a HybridPulseCard and a CardRef, PUT accepts this format, we should make sure POST does as well"
      (mt/with-temp [Card card-1 {}
                     Card card-2 {:name        "The card"
                                  :description "Info"
                                  :display     :table}]
        (api.card-test/with-cards-in-readable-collection [card-1 card-2]
          (t2.with-temp/with-temp [Collection collection]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (mt/with-model-cleanup [Pulse]
              (is (= (merge
                      pulse-defaults
                      {:name          "A Pulse"
                       :creator_id    (mt/user->id :rasta)
                       :creator       (user-details (mt/fetch-user :rasta))
                       :cards         (for [card [card-1 card-2]]
                                        (assoc (pulse-card-details card)
                                               :collection_id true))
                       :channels      [(merge pulse-channel-defaults
                                              {:channel_type  "email"
                                               :schedule_type "daily"
                                               :schedule_hour 12
                                               :recipients    []})]
                       :collection_id true})
                     (-> (mt/user-http-request :rasta :post 200 "pulse" {:name          "A Pulse"
                                                                         :collection_id (u/the-id collection)
                                                                         :cards         [{:id                (u/the-id card-1)
                                                                                          :include_csv       false
                                                                                          :include_xls       false
                                                                                          :dashboard_card_id nil}
                                                                                         (-> card-2
                                                                                             (select-keys [:id :name :description :display :collection_id])
                                                                                             (assoc :include_csv false, :include_xls false, :dashboard_id nil,
                                                                                                    :dashboard_card_id nil, :parameter_mappings nil))]
                                                                         :channels      [daily-email-channel]
                                                                         :skip_if_empty false})
                         pulse-response
                         (update :channels remove-extra-channels-fields)))))))))))

(deftest create-csv-xls-test
  (testing "POST /api/pulse"
    (testing "Create a pulse with a csv and xls"
      (mt/with-temp [Card card-1 {}
                     Card card-2] {}
        (mt/with-non-admin-groups-no-root-collection-perms
          (t2.with-temp/with-temp [Collection collection]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (mt/with-model-cleanup [Pulse]
              (api.card-test/with-cards-in-readable-collection [card-1 card-2]
                (is (= (merge
                        pulse-defaults
                        {:name          "A Pulse"
                         :creator_id    (mt/user->id :rasta)
                         :creator       (user-details (mt/fetch-user :rasta))
                         :cards         [(assoc (pulse-card-details card-1) :include_csv true, :include_xls true, :collection_id true, :dashboard_card_id nil)
                                         (assoc (pulse-card-details card-2) :collection_id true)]
                         :channels      [(merge pulse-channel-defaults
                                                {:channel_type  "email"
                                                 :schedule_type "daily"
                                                 :schedule_hour 12
                                                 :recipients    []})]
                         :collection_id true})
                       (-> (mt/user-http-request :rasta :post 200 "pulse" {:name          "A Pulse"
                                                                           :collection_id (u/the-id collection)
                                                                           :cards         [{:id                (u/the-id card-1)
                                                                                            :include_csv       true
                                                                                            :include_xls       true
                                                                                            :format_rows       true
                                                                                            :dashboard_card_id nil}
                                                                                           {:id                (u/the-id card-2)
                                                                                            :include_csv       false
                                                                                            :include_xls       false
                                                                                            :format_rows       true
                                                                                            :dashboard_card_id nil}]
                                                                           :channels      [daily-email-channel]
                                                                           :skip_if_empty false})
                           pulse-response
                           (update :channels remove-extra-channels-fields))))))))))))

(deftest create-with-collection-position-test
  (testing "POST /api/pulse"
    (testing "Make sure we can create a Pulse with a Collection position"
      (mt/with-model-cleanup [Pulse]
        (letfn [(create-pulse! [expected-status-code pulse-name card collection]
                  (let [response (mt/user-http-request :rasta :post expected-status-code "pulse"
                                                       {:name                pulse-name
                                                        :cards               [{:id                (u/the-id card)
                                                                               :include_csv       false
                                                                               :include_xls       false
                                                                               :dashboard_card_id nil}]
                                                        :channels            [daily-email-channel]
                                                        :skip_if_empty       false
                                                        :collection_id       (u/the-id collection)
                                                        :collection_position 1})]
                    (testing "response"
                      (is (= nil
                             (:errors response))))))]
          (let [pulse-name (mt/random-name)]
            (mt/with-temp [Card       card {}
                           Collection collection] {}
              (api.card-test/with-cards-in-readable-collection [card]
                (create-pulse! 200 pulse-name card collection)
                (is (= {:collection_id (u/the-id collection), :collection_position 1}
                       (mt/derecordize (t2/select-one [Pulse :collection_id :collection_position] :name pulse-name)))))))

          (testing "...but not if we don't have permissions for the Collection"
            (mt/with-non-admin-groups-no-root-collection-perms
              (let [pulse-name (mt/random-name)]
                (mt/with-temp [Card       card {}
                               Collection collection] {}
                  (create-pulse! 403 pulse-name card collection)
                  (is (= nil
                         (t2/select-one [Pulse :collection_id :collection_position] :name pulse-name))))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PUT /api/pulse/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private default-put-card-ref-validation-error
  {:errors
   {:cards (str "nullable one or more value must be a map with the following keys "
                "`(collection_id, description, display, id, include_csv, include_xls, name, dashboard_id, parameter_mappings)`, "
                "or value must be a map with the keys `id`, `include_csv`, `include_xls`, and `dashboard_card_id`., "
                "or value must be a map with the keys `include_csv`, `include_xls`, and `dashboard_card_id`.")}})

(deftest update-pulse-validation-test
  (testing "PUT /api/pulse/:id"
    (doseq [[input expected-error]
            {{:name 123}
             {:errors {:name "nullable value must be a non-blank string."},
              :specific-errors {:name ["should be a string, received: 123" "non-blank string, received: 123"]}}

             {:cards 123}
             default-put-card-ref-validation-error

             {:cards "foobar"}
             default-put-card-ref-validation-error

             {:cards ["abc"]}
             default-put-card-ref-validation-error

             {:channels 123}
             {:errors {:channels "nullable one or more map"}}

             {:channels "foobar"}
             {:errors {:channels "nullable one or more map"}}

             {:channels ["abc"]}
             {:errors {:channels "nullable one or more map"}}}]
      (testing (pr-str input)
        (is (=? expected-error
                (mt/user-http-request :rasta :put 400 "pulse/1" input)))))))

(deftest update-test
  (testing "PUT /api/pulse/:id"
    (mt/with-temp [Pulse                 pulse {}
                   PulseChannel          pc    {:pulse_id (u/the-id pulse)}
                   PulseChannelRecipient _     {:pulse_channel_id (u/the-id pc) :user_id (mt/user->id :rasta)}
                   Card                  card  {}]
      (let [filter-params [{:id "123abc", :name "species", :type "string"}]]
        (with-pulses-in-writeable-collection [pulse]
          (api.card-test/with-cards-in-readable-collection [card]
            (is (= (merge
                    pulse-defaults
                    {:name          "Updated Pulse"
                     :creator_id    (mt/user->id :rasta)
                     :creator       (user-details (mt/fetch-user :rasta))
                     :cards         [(assoc (pulse-card-details card)
                                            :collection_id true)]
                     :channels      [(merge pulse-channel-defaults
                                            {:channel_type  "slack"
                                             :schedule_type "hourly"
                                             :details       {:channels "#general"}
                                             :recipients    []})]
                     :collection_id true
                     :parameters    filter-params})
                   (-> (mt/user-http-request :rasta :put 200 (format "pulse/%d" (u/the-id pulse))
                                             {:name          "Updated Pulse"
                                              :cards         [{:id                (u/the-id card)
                                                               :include_csv       false
                                                               :include_xls       false
                                                               :dashboard_card_id nil}]
                                              :channels      [{:enabled       true
                                                               :channel_type  "slack"
                                                               :schedule_type "hourly"
                                                               :schedule_hour 12
                                                               :schedule_day  "mon"
                                                               :recipients    []
                                                               :details       {:channels "#general"}}]
                                              :skip_if_empty false
                                              :parameters    filter-params})
                       pulse-response
                       (update :channels remove-extra-channels-fields))))))))))

(deftest add-card-to-existing-test
  (testing "PUT /api/pulse/:id"
    (testing "Can we add a card to an existing pulse that has a card?"
      ;; Specifically this will include a HybridPulseCard (the original card associated with the pulse) and a CardRef
      ;; (the new card)
      (mt/with-temp [Pulse                 pulse {:name "Original Pulse Name"}
                     Card                  card-1 {:name        "Test"
                                                   :description "Just Testing"}
                     PulseCard             _      {:card_id  (u/the-id card-1)
                                                   :pulse_id (u/the-id pulse)}
                     Card                  card-2 {:name        "Test2"
                                                   :description "Just Testing2"}]
        (with-pulses-in-writeable-collection [pulse]
          (api.card-test/with-cards-in-readable-collection [card-1 card-2]
            ;; The FE will include the original HybridPulseCard, similar to how the API returns the card via GET
            (let [pulse-cards (:cards (mt/user-http-request :rasta :get 200 (format "pulse/%d" (u/the-id pulse))))]
              (is (= (merge
                      pulse-defaults
                      {:name          "Original Pulse Name"
                       :creator_id    (mt/user->id :rasta)
                       :creator       (user-details (mt/fetch-user :rasta))
                       :cards         (mapv (comp #(assoc % :collection_id true) pulse-card-details) [card-1 card-2])
                       :channels      []
                       :collection_id true})
                     (-> (mt/user-http-request :rasta :put 200 (format "pulse/%d" (u/the-id pulse))
                                               {:cards (concat pulse-cards
                                                               [{:id                (u/the-id card-2)
                                                                 :include_csv       false
                                                                 :include_xls       false
                                                                 :dashboard_card_id nil}])})
                         pulse-response
                         (update :channels remove-extra-channels-fields)))))))))))

(deftest update-collection-id-test
  (testing "Can we update *just* the Collection ID of a Pulse?"
    (mt/with-temp [Pulse      pulse {}
                   Collection collection] {}
      (mt/user-http-request :crowberto :put 200 (str "pulse/" (u/the-id pulse))
                            {:collection_id (u/the-id collection)})
      (is (= (t2/select-one-fn :collection_id Pulse :id (u/the-id pulse))
             (u/the-id collection))))))

(deftest change-collection-test
  (testing "Can we change the Collection a Pulse is in (assuming we have the permissions to do so)?"
    (pulse-test/with-pulse-in-collection [_db collection pulse]
      (t2.with-temp/with-temp [Collection new-collection]
        ;; grant Permissions for both new and old collections
        (doseq [coll [collection new-collection]]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
        ;; now make an API call to move collections
        (mt/user-http-request :rasta :put 200 (str "pulse/" (u/the-id pulse)) {:collection_id (u/the-id new-collection)})
        ;; Check to make sure the ID has changed in the DB
        (is (= (t2/select-one-fn :collection_id Pulse :id (u/the-id pulse))
               (u/the-id new-collection)))))

    (testing "...but if we don't have the Permissions for the old collection, we should get an Exception"
      (pulse-test/with-pulse-in-collection [_db _collection pulse]
        (t2.with-temp/with-temp [Collection new-collection]
          ;; grant Permissions for only the *new* collection
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
          ;; now make an API call to move collections. Should fail
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "pulse/" (u/the-id pulse)) {:collection_id (u/the-id new-collection)}))))))

    (testing "...and if we don't have the Permissions for the new collection, we should get an Exception"
      (pulse-test/with-pulse-in-collection [_db collection pulse]
        (t2.with-temp/with-temp [Collection new-collection]
          ;; grant Permissions for only the *old* collection
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          ;; now make an API call to move collections. Should fail
          (is (=? {:message "You do not have curate permissions for this Collection."}
                  (mt/user-http-request :rasta :put 403 (str "pulse/" (u/the-id pulse)) {:collection_id (u/the-id new-collection)}))))))))

(deftest update-collection-position-test
  (testing "Can we change the Collection position of a Pulse?"
    (pulse-test/with-pulse-in-collection [_ collection pulse]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (mt/user-http-request :rasta :put 200 (str "pulse/" (u/the-id pulse))
                            {:collection_position 1})
      (is (= 1
             (t2/select-one-fn :collection_position Pulse :id (u/the-id pulse)))))

    (testing "...and unset (unpin) it as well?"
      (pulse-test/with-pulse-in-collection [_ collection pulse]
        (t2/update! Pulse (u/the-id pulse) {:collection_position 1})
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (mt/user-http-request :rasta :put 200 (str "pulse/" (u/the-id pulse))
                              {:collection_position nil})
        (is (= nil
               (t2/select-one-fn :collection_position Pulse :id (u/the-id pulse))))))

    (testing "...we shouldn't be able to if we don't have permissions for the Collection"
      (pulse-test/with-pulse-in-collection [_db _collection pulse]
        (mt/user-http-request :rasta :put 403 (str "pulse/" (u/the-id pulse))
                              {:collection_position 1})
        (is (= nil
               (t2/select-one-fn :collection_position Pulse :id (u/the-id pulse))))

        (testing "shouldn't be able to unset (unpin) a Pulse"
          (t2/update! Pulse (u/the-id pulse) {:collection_position 1})
          (mt/user-http-request :rasta :put 403 (str "pulse/" (u/the-id pulse))
                                {:collection_position nil})
          (is (= 1
                 (t2/select-one-fn :collection_position Pulse :id (u/the-id pulse)))))))))

(deftest archive-test
  (testing "Can we archive a Pulse?"
    (pulse-test/with-pulse-in-collection [_ collection pulse]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (mt/user-http-request :rasta :put 200 (str "pulse/" (u/the-id pulse))
                            {:archived true})
      (is (= true
             (t2/select-one-fn :archived Pulse :id (u/the-id pulse)))))))

(deftest unarchive-test
  (testing "Can we unarchive a Pulse?"
    (pulse-test/with-pulse-in-collection [_ collection pulse]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (t2/update! Pulse (u/the-id pulse) {:archived true})
      (mt/user-http-request :rasta :put 200 (str "pulse/" (u/the-id pulse))
                            {:archived false})
      (is (= false
             (t2/select-one-fn :archived Pulse :id (u/the-id pulse))))))

  (testing "Does unarchiving a Pulse affect its Cards & Recipients? It shouldn't. This should behave as a PATCH-style endpoint!"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [Collection            collection {}
                     Pulse                 pulse {:collection_id (u/the-id collection)}
                     PulseChannel          pc    {:pulse_id (u/the-id pulse)}
                     PulseChannelRecipient pcr   {:pulse_channel_id (u/the-id pc) :user_id (mt/user->id :rasta)}
                     Card                  _     {}]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (mt/user-http-request :rasta :put 200 (str "pulse/" (u/the-id pulse))
                              {:archived true})
        (mt/user-http-request :rasta :put 200 (str "pulse/" (u/the-id pulse))
                              {:archived false})
        (is (t2/exists? PulseChannel :id (u/the-id pc)))
        (is (t2/exists? PulseChannelRecipient :id (u/the-id pcr)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   UPDATING PULSE COLLECTION POSITIONS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private move-pulse-test-action
  {:arglists '([action context & args])}
  (fn [action & _]
    action))

(defmethod move-pulse-test-action :move
  [_ context pulse & {:keys [collection position]}]
  (let [pulse    (get-in context [:pulse pulse])
        response (mt/user-http-request :rasta :put 200 (str "pulse/" (u/the-id pulse))
                                       (merge
                                        (when collection
                                          {:collection_id (u/the-id (get-in context [:collection collection]))})
                                        (when position
                                          {:collection_position position})))]
    (is (= nil
           (:errors response)))))

(defmethod move-pulse-test-action :insert-pulse
  [_ context collection & {:keys [position]}]
  (let [collection (get-in context [:collection collection])
        response   (mt/user-http-request :rasta :post 200 "pulse"
                                         (merge
                                          {:name          "x"
                                           :collection_id (u/the-id collection)
                                           :cards         [{:id                (u/the-id (get-in context [:card 1]))
                                                            :include_csv       false
                                                            :include_xls       false
                                                            :dashboard_card_id nil}]
                                           :channels      [daily-email-channel]
                                           :skip_if_empty false}
                                          (when position
                                            {:collection_position position})))]
    (is (= nil
           (:errors response)))))

(def ^:private move-test-definitions
  [{:message  "Check that we can update a Pulse's position in a Collection"
    :action   [:move :d :position 1]
    :expected {"d" 1
               "a" 2
               "b" 3
               "c" 4}}
   {:message  "Change the position of b to 4, will dec c and d"
    :action   [:move :b :position 4]
    :expected {"a" 1
               "c" 2
               "d" 3
               "b" 4}}
   {:message  "Change the position of d to 2, should inc b and c"
    :action   [:move :d :position 2]
    :expected {"a" 1
               "d" 2
               "b" 3
               "c" 4}}
   {:message  "Change the position of a to 4th, will decrement all existing items"
    :action   [:move :a :position 4]
    :expected {"b" 1
               "c" 2
               "d" 3
               "a" 4}}
   {:message  "Change the position of the d to the 1st, will increment all existing items"
    :action   [:move :d :position 1]
    :expected {"d" 1
               "a" 2
               "b" 3
               "c" 4}}
   {:message  (str "Check that no position change, but changing collections still triggers a fixup of both "
                   "collections Moving `c` from collection-1 to collection-2, `c` is now at position 3 in "
                   "collection 2")
    :action   [:move :c :collection 2]
    :expected [{"a" 1
                "b" 2
                "d" 3}
               {"e" 1
                "f" 2
                "c" 3
                "g" 4
                "h" 5}]}
   {:message  (str "Check that moving a pulse to another collection, with a changed position will fixup "
                   "both collections Moving `b` to collection 2, giving it a position of 1")
    :action   [:move :b :collection 2, :position 1]
    :expected [{"a" 1
                "c" 2
                "d" 3}
               {"b" 1
                "e" 2
                "f" 3
                "g" 4
                "h" 5}]}
   {:message "Add a new pulse at position 2, causing existing pulses to be incremented"
    :action [:insert-pulse 1 :position 2]
    :expected {"a" 1
               "x" 2
               "b" 3
               "c" 4
               "d" 5}}

   {:message  "Add a new pulse without a position, should leave existing positions unchanged"
    :action   [:insert-pulse 1]
    :expected {"x" nil
               "a" 1
               "b" 2
               "c" 3
               "d" 4}}])

(deftest move-pulse-test
  (testing "PUT /api/pulse/:id"
    (doseq [{:keys [message action expected]} move-test-definitions
            :let                              [expected (if (map? expected) [expected] expected)]]
      (testing (str "\n" message)
        (mt/with-temp [Collection collection-1 {}
                       Collection collection-2 {}
                       Card       card-1 {}]
          (api.card-test/with-ordered-items collection-1 [Pulse a
                                                          Pulse b
                                                          Pulse c
                                                          Pulse d]
            (api.card-test/with-ordered-items collection-2 [Card      e
                                                            Card      f
                                                            Dashboard g
                                                            Dashboard h]
              (let [[action & args] action
                    context         {:pulse      {:a a, :b b, :c c, :d d, :e e, :f f, :g g, :h h}
                                     :collection {1 collection-1, 2 collection-2}
                                     :card       {1 card-1}}]
                (testing (str "\n" (pr-str (cons action args)))
                  (apply move-pulse-test-action action context args)))
              (testing "\nPositions after actions for"
                (testing "Collection 1"
                  (is (= (first expected)
                         (api.card-test/get-name->collection-position :rasta (u/the-id collection-1)))))
                (when (second expected)
                  (testing "Collection 2"
                    (is (= (second expected)
                           (api.card-test/get-name->collection-position :rasta (u/the-id collection-2))))))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 GET /api/pulse                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- filter-pulse-results
  "Filters a list of pulse results based on a set of expected values for a given field."
  [results field expected]
  (filter
   (fn [pulse] ((set expected) (field pulse)))
   results))

(deftest list-test
  (testing "GET /api/pulse"
    ;; pulse-1 => created by non-admin
    ;; pulse-2 => created by admin
    ;; pulse-3 => created by admin; non-admin recipient
    (mt/with-temp [Dashboard             {dashboard-id :id} {}
                   Pulse                 {pulse-1-id :id :as pulse-1} {:name         "ABCDEF"
                                                                       :dashboard_id dashboard-id
                                                                       :creator_id   (mt/user->id :rasta)}
                   Pulse                 {pulse-2-id :id :as pulse-2} {:name         "GHIJKL"
                                                                       :dashboard_id dashboard-id
                                                                       :creator_id   (mt/user->id :crowberto)}
                   Pulse                 {pulse-3-id :id :as pulse-3} {:name         "MNOPQR"
                                                                       :dashboard_id dashboard-id
                                                                       :creator_id   (mt/user->id :crowberto)}
                   PulseChannel          pc {:pulse_id pulse-3-id}
                   PulseChannelRecipient _  {:pulse_channel_id (u/the-id pc)
                                             :user_id          (mt/user->id :rasta)}]
      (with-pulses-in-writeable-collection [pulse-1 pulse-2 pulse-3]
        (testing "admins can see all pulses"
          (let [results (-> (mt/user-http-request :crowberto :get 200 "pulse")
                            (filter-pulse-results :id #{pulse-1-id pulse-2-id pulse-3-id}))]
            (is (= 3 (count results)))
            (is (partial=
                 [(assoc (pulse-details pulse-1) :can_write true, :collection_id true)
                  (assoc (pulse-details pulse-2) :can_write true, :collection_id true)
                  (assoc (pulse-details pulse-3) :can_write true, :collection_id true)]
                 (map #(update % :collection_id boolean) results)))))

        (testing "non-admins only see pulses they created by default"
          (let [results (-> (mt/user-http-request :rasta :get 200 "pulse")
                            (filter-pulse-results :id #{pulse-1-id pulse-2-id pulse-3-id}))]
            (is (= 1 (count results)))
            (is (partial=
                 [(assoc (pulse-details pulse-1) :can_write true, :collection_id true)]
                 (map #(update % :collection_id boolean) results)))))

        (testing "when `creator_or_recipient=true`, all users only see pulses they created or are a recipient of"
          (let [expected-pulse-shape (fn [pulse] (-> pulse
                                                     pulse-details
                                                     (assoc :can_write true, :collection_id true)
                                                     (dissoc :cards)))]
            (let [results (-> (mt/user-http-request :crowberto :get 200 "pulse?creator_or_recipient=true")
                              (filter-pulse-results :id #{pulse-1-id pulse-2-id pulse-3-id}))]
              (is (= 2 (count results)))
              (is (partial=
                   [(expected-pulse-shape pulse-2) (expected-pulse-shape pulse-3)]
                   (map #(update % :collection_id boolean) results))))

            (let [results (-> (mt/user-http-request :rasta :get 200 "pulse?creator_or_recipient=true")
                              (filter-pulse-results :id #{pulse-1-id pulse-2-id pulse-3-id}))]
              (is (= 2 (count results)))
              (is (partial=
                   [(expected-pulse-shape pulse-1)
                    (assoc (expected-pulse-shape pulse-3) :can_write false)]
                   (map #(update % :collection_id boolean) results)))))))

      (with-pulses-in-nonreadable-collection [pulse-3]
        (testing "when `creator_or_recipient=true`, cards and recipients are not included in results if the user
                 does not have collection perms"
          (let [result (-> (mt/user-http-request :rasta :get 200 "pulse?creator_or_recipient=true")
                           (filter-pulse-results :id #{pulse-3-id})
                           first)]
            (is (nil? (:cards result)))
            (is (nil? (get-in result [:channels 0 :recipients])))))))

    (testing "should not return alerts"
      (mt/with-temp [Pulse pulse-1 {:name "ABCDEF"}
                     Pulse pulse-2 {:name "GHIJKL"}
                     Pulse pulse-3 {:name            "AAAAAA"
                                    :alert_condition "rows"}]
        (with-pulses-in-readable-collection [pulse-1 pulse-2 pulse-3]
          (is (= [(assoc (pulse-details pulse-1) :can_write true, :collection_id true)
                  (assoc (pulse-details pulse-2) :can_write true, :collection_id true)]
                 (for [pulse (-> (mt/user-http-request :rasta :get 200 "pulse")
                                 (filter-pulse-results :name #{"ABCDEF" "GHIJKL" "AAAAAA"}))]
                   (update pulse :collection_id boolean)))))))

    (testing "by default, archived Pulses should be excluded"
      (mt/with-temp [Pulse not-archived-pulse {:name "Not Archived"}
                     Pulse archived-pulse     {:name "Archived" :archived true}]
        (with-pulses-in-readable-collection [not-archived-pulse archived-pulse]
          (is (= #{"Not Archived"}
                 (set (map :name (-> (mt/user-http-request :rasta :get 200 "pulse")
                                     (filter-pulse-results :name #{"Not Archived" "Archived"})))))))))

    (testing "can we fetch archived Pulses?"
      (mt/with-temp [Pulse not-archived-pulse {:name "Not Archived"}
                     Pulse archived-pulse     {:name "Archived" :archived true}]
        (with-pulses-in-readable-collection [not-archived-pulse archived-pulse]
          (is (= #{"Archived"}
                 (set (map :name (-> (mt/user-http-request :rasta :get 200 "pulse?archived=true")
                                     (filter-pulse-results :name #{"Not Archived" "Archived"})))))))))

    (testing "excludes dashboard subscriptions associated with archived dashboards"
      (mt/with-temp [Dashboard {dashboard-id :id} {:archived true}
                     Pulse     {pulse-id :id} {:dashboard_id dashboard-id}]
        (is (= [] (-> (mt/user-http-request :rasta :get 200 "pulse")
                      (filter-pulse-results :id #{pulse-id}))))))))

(deftest get-pulse-test
  (testing "GET /api/pulse/:id"
    (t2.with-temp/with-temp [Pulse pulse]
      (with-pulses-in-readable-collection [pulse]
        (is (= (assoc (pulse-details pulse)
                      :can_write     true
                      :collection_id true)
               (-> (mt/user-http-request :rasta :get 200 (str "pulse/" (u/the-id pulse)))
                   (update :collection_id boolean))))))

    (testing "cannot normally fetch a pulse without collection permissions"
      (t2.with-temp/with-temp [Pulse pulse {:creator_id (mt/user->id :crowberto)}]
        (with-pulses-in-nonreadable-collection [pulse]
          (mt/user-http-request :rasta :get 403 (str "pulse/" (u/the-id pulse))))))

    (testing "can fetch a pulse without collection permissions if you are the creator or a recipient"
      (t2.with-temp/with-temp [Pulse pulse {:creator_id (mt/user->id :rasta)}]
        (with-pulses-in-nonreadable-collection [pulse]
          (mt/user-http-request :rasta :get 200 (str "pulse/" (u/the-id pulse)))))

      (mt/with-temp [Pulse                 pulse {:creator_id (mt/user->id :crowberto)}
                     PulseChannel          pc    {:pulse_id (u/the-id pulse)}
                     PulseChannelRecipient _     {:pulse_channel_id (u/the-id pc)
                                                  :user_id          (mt/user->id :rasta)}]
        (with-pulses-in-nonreadable-collection [pulse]
          (mt/user-http-request :rasta :get 200 (str "pulse/" (u/the-id pulse))))))

    (testing "should 404 for an Alert"
      (t2.with-temp/with-temp [Pulse {pulse-id :id} {:alert_condition "rows"}]
        (is (= "Not found."
               (with-pulses-in-readable-collection [pulse-id]
                 (mt/user-http-request :rasta :get 404 (str "pulse/" pulse-id)))))))))

(deftest send-test-pulse-test
  ;; see [[metabase-enterprise.advanced-config.api.pulse-test/test-pulse-endpoint-should-respect-email-domain-allow-list-test]]
  ;; for additional EE-specific tests
  (testing "POST /api/pulse/test"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-fake-inbox
        (mt/dataset sad-toucan-incidents
          (mt/with-temp [Collection collection {}
                         Card       card  {:dataset_query (mt/mbql-query incidents {:aggregation [[:count]]})}]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (api.card-test/with-cards-in-readable-collection [card]
              (is (= {:ok true}
                     (mt/user-http-request :rasta :post 200 "pulse/test" {:name          "Daily Sad Toucans"
                                                                          :collection_id (u/the-id collection)
                                                                          :cards         [{:id                (u/the-id card)
                                                                                           :include_csv       false
                                                                                           :include_xls       false
                                                                                           :dashboard_card_id nil}]
                                                                          :channels      [{:enabled       true
                                                                                           :channel_type  "email"
                                                                                           :schedule_type "daily"
                                                                                           :schedule_hour 12
                                                                                           :schedule_day  nil
                                                                                           :recipients    [(mt/fetch-user :rasta)]}]
                                                                          :skip_if_empty false})))
              (is (= (mt/email-to :rasta {:subject "Pulse: Daily Sad Toucans"
                                          :body    {"Daily Sad Toucans" true}
                                          :bcc?    true})
                     (mt/regex-email-bodies #"Daily Sad Toucans"))))))))))

(deftest send-test-pulse-validate-emails-test
  (testing (str "POST /api/pulse/test should call " `pulse-channel/validate-email-domains)
    (t2.with-temp/with-temp [Card card {:dataset_query (mt/mbql-query venues)}]
      (with-redefs [pulse-channel/validate-email-domains (fn [& _]
                                                           (throw (ex-info "Nope!" {:status-code 403})))]
        ;; make sure we validate raw emails whether they're part of `:details` or part of `:recipients` -- we
        ;; technically allow either right now
        (doseq [channel [{:details {:emails ["test@metabase.com"]}}
                         {:recipients [{:email "test@metabase.com"}]
                          :details    {}}]
                :let    [pulse-name   (mt/random-name)
                         request-body {:name          pulse-name
                                       :cards         [{:id                (u/the-id card)
                                                        :include_csv       false
                                                        :include_xls       false
                                                        :dashboard_card_id nil}]
                                       :channels      [(assoc channel
                                                              :enabled       true
                                                              :channel_type  "email"
                                                              :schedule_type "daily"
                                                              :schedule_hour 12
                                                              :schedule_day  nil)]
                                       :skip_if_empty false}]]
          (testing (format "\nchannel =\n%s" (u/pprint-to-str channel))
            (mt/with-fake-inbox
              (is (= "Nope!"
                     (mt/user-http-request :rasta :post 403 "pulse/test" request-body)))
              (is (not (contains? (set (keys (mt/regex-email-bodies (re-pattern pulse-name))))
                                  "test@metabase.com"))))))))))

(deftest send-test-pulse-native-query-default-parameters-test
  (testing "POST /api/pulse/test should work with a native query with default parameters"
    (mt/with-temp [Card {card-id :id} {:dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query         "SELECT {{x}}"
                                                                  :template-tags {"x" {:id           "abc"
                                                                                       :name         "x"
                                                                                       :display-name "X"
                                                                                       :type         :number
                                                                                       :required     true}}}}}
                   Dashboard {dashboard-id :id} {:parameters [{:name    "X"
                                                               :slug    "x"
                                                               :id      "__X__"
                                                               :type    "category"
                                                               :default 3}]}
                   DashboardCard _ {:card_id            card-id
                                    :dashboard_id       dashboard-id
                                    :parameter_mappings [{:parameter_id "__X__"
                                                          :card_id      card-id
                                                          :target       [:variable [:template-tag "x"]]}]}]
      (mt/with-fake-inbox
        (is (= {:ok true}
               (mt/user-http-request :rasta :post 200 "pulse/test" {:name          "Daily Sad Toucans"
                                                                    :dashboard_id  dashboard-id
                                                                    :cards         [{:id                card-id
                                                                                     :include_csv       false
                                                                                     :include_xls       false
                                                                                     :dashboard_card_id nil}]
                                                                    :channels      [{:enabled       true
                                                                                     :channel_type  "email"
                                                                                     :schedule_type "daily"
                                                                                     :schedule_hour 12
                                                                                     :schedule_day  nil
                                                                                     :recipients    [(mt/fetch-user :rasta)]}]
                                                                    :skip_if_empty false})))
        (is (= (mt/email-to :rasta {:subject "Daily Sad Toucans"
                                    :body    {"Daily Sad Toucans" true}
                                    :bcc?    true})
               (mt/regex-email-bodies #"Daily Sad Toucans")))))))

(deftest send-placeholder-card-test-pulse-test
  (testing "POST /api/pulse/test should work with placeholder cards"
    (mt/with-temp [Dashboard {dashboard-id :id} {}]
      (mt/with-fake-inbox
        (is (= {:ok true}
               (mt/user-http-request :rasta :post 200 "pulse/test" {:name          "Daily Sad Toucans"
                                                                    :dashboard_id  dashboard-id
                                                                    :cards         [{:display           "placeholder"
                                                                                     :id                nil
                                                                                     :include_csv       false
                                                                                     :include_xls       false
                                                                                     :dashboard_card_id nil}]
                                                                    :channels      [{:enabled       true
                                                                                     :channel_type  "email"
                                                                                     :schedule_type "daily"
                                                                                     :schedule_hour 12
                                                                                     :schedule_day  nil
                                                                                     :recipients    [(mt/fetch-user :rasta)]}]
                                                                    :skip_if_empty false})))
        (is (= (mt/email-to :rasta {:subject "Daily Sad Toucans"
                                    :body    {"Daily Sad Toucans" true}
                                    :bcc?    true})
               (mt/regex-email-bodies #"Daily Sad Toucans")))))))

;; This test follows a flow that the user/UI would follow by first creating a pulse, then making a small change to
;; that pulse and testing it. The primary purpose of this test is to ensure tha the pulse/test endpoint accepts data
;; of the same format that the pulse GET returns
(deftest update-flow-test
  (mt/with-temp [Card card-1 {:dataset_query
                              {:database (mt/id) :type :query :query {:source-table (mt/id :venues)}}}
                 Card card-2 {:dataset_query
                              {:database (mt/id) :type :query :query {:source-table (mt/id :venues)}}}]

    (api.card-test/with-cards-in-readable-collection [card-1 card-2]
      (mt/with-fake-inbox
        (mt/with-model-cleanup [Pulse]
          (t2.with-temp/with-temp [Collection collection]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            ;; First create the pulse
            (let [{pulse-id :id} (mt/user-http-request :rasta :post 200 "pulse"
                                                       {:name          "A Pulse"
                                                        :collection_id (u/the-id collection)
                                                        :skip_if_empty false
                                                        :cards         [{:id                (u/the-id card-1)
                                                                         :include_csv       false
                                                                         :include_xls       false
                                                                         :dashboard_card_id nil}
                                                                        {:id                (u/the-id card-2)
                                                                         :include_csv       false
                                                                         :include_xls       false
                                                                         :dashboard_card_id nil}]

                                                        :channels      [(assoc daily-email-channel :recipients [(mt/fetch-user :rasta)
                                                                                                                (mt/fetch-user :crowberto)])]})
                  ;; Retrieve the pulse via GET
                  result        (mt/user-http-request :rasta :get 200 (str "pulse/" pulse-id))
                  ;; Change our fetched copy of the pulse to only have Rasta for the recipients
                  email-channel (assoc (-> result :channels first) :recipients [(mt/fetch-user :rasta)])]
              ;; Don't update the pulse, but test the pulse with the updated recipients
              (is (= {:ok true}
                     (mt/user-http-request :rasta :post 200 "pulse/test" (assoc result :channels [email-channel]))))
              (is (= (mt/email-to :rasta {:subject "Pulse: A Pulse"
                                          :body    {"A Pulse" true}
                                          :bcc?    true})
                     (mt/regex-email-bodies #"A Pulse"))))))))))

(deftest ^:parallel pulse-card-query-results-test
  (testing "viz-settings saved in the DB for a Card should be loaded"
    (is (some? (get-in (#'api.pulse/pulse-card-query-results
                        {:id            1
                         :dataset_query {:database (mt/id)
                                         :type     :query
                                         :query    {:source-table (mt/id :venues)
                                                    :limit        1}}})
                       [:data :viz-settings])))))

(deftest form-input-test
  (testing "GET /api/pulse/form_input"
    (testing "Check that Slack channels come back when configured"
      (mt/with-temporary-setting-values [slack/slack-channels-and-usernames-last-updated
                                         (t/zoned-date-time)

                                         slack/slack-app-token "test-token"

                                         slack/slack-cached-channels-and-usernames
                                         {:channels [{:type "channel"
                                                      :name "foo"
                                                      :display-name "#foo"
                                                      :id "CAAS3DD9XND"}
                                                     {:type "channel"
                                                      :name "general"
                                                      :display-name "#general"
                                                      :id "C3MJRZ9EUVA"}
                                                     {:type "user"
                                                      :name "user1"
                                                      :id "U1DYU9W3WZ2"
                                                      :display-name "@user1"}]}]
        (is (= [{:name "channel", :type "select", :displayName "Post to",
                 :options ["#foo" "#general" "@user1"], :required true}]
               (-> (mt/user-http-request :rasta :get 200 "pulse/form_input")
                   (get-in [:channels :slack :fields]))))))

    (testing "When slack is not configured, `form_input` returns no channels"
      (mt/with-temporary-setting-values [slack-token nil
                                         slack-app-token nil]
        (is (empty?
               (-> (mt/user-http-request :rasta :get 200 "pulse/form_input")
                   (get-in [:channels :slack :fields])
                   (first)
                   (:options))))))))

(deftest preview-pulse-test
  (testing "GET /api/pulse/preview_card/:id"
    (mt/with-temp [Collection _ {}
                   Card       card {:dataset_query (mt/mbql-query checkins {:limit 5})}]
      (letfn [(preview [expected-status-code]
                (client/client-full-response (mt/user->credentials :rasta)
                                             :get expected-status-code (format "pulse/preview_card_png/%d" (u/the-id card))))]
        (testing "Should be able to preview a Pulse"
          (let [{{:strs [Content-Type]} :headers, :keys [body]} (preview 200)]
            (is (= "image/png"
                   Content-Type))
            (is (some? body))))

        (testing "If rendering a Pulse fails (e.g. because font registration failed) the endpoint should return the error message"
          (with-redefs [style/register-fonts-if-needed! (fn []
                                                          (throw (ex-info "Can't register fonts!"
                                                                          {}
                                                                          (NullPointerException.))))]
            (let [{{:strs [Content-Type]} :headers, :keys [body]} (preview 500)]
              (is (= "application/json; charset=utf-8"
                     Content-Type))
              (is (malli= [:map
                           [:message  [:= "Can't register fonts!"]]
                           [:trace    :any]
                           [:via      :any]]
                          body)))))))))

(deftest delete-subscription-test
  (testing "DELETE /api/pulse/:id/subscription"
    (mt/with-temp [Pulse        {pulse-id :id}   {:name "Lodi Dodi" :creator_id (mt/user->id :crowberto)}
                   PulseChannel {channel-id :id} {:pulse_id      pulse-id
                                                  :channel_type  "email"
                                                  :schedule_type "daily"
                                                  :details       {:other  "stuff"
                                                                  :emails ["foo@bar.com"]}}]
      (testing "Should be able to delete your own subscription"
        (t2.with-temp/with-temp [PulseChannelRecipient _ {:pulse_channel_id channel-id :user_id (mt/user->id :rasta)}]
          (is (= nil
                 (mt/user-http-request :rasta :delete 204 (str "pulse/" pulse-id "/subscription"))))))

      (testing "Users can't delete someone else's pulse subscription"
        (t2.with-temp/with-temp [PulseChannelRecipient _ {:pulse_channel_id channel-id :user_id (mt/user->id :rasta)}]
          (is (= "Not found."
                 (mt/user-http-request :lucky :delete 404 (str "pulse/" pulse-id "/subscription")))))))))
