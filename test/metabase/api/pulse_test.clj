(ns metabase.api.pulse-test
  "Tests for /api/pulse endpoints."
  (:require [clojure.test :refer :all]
            [metabase
             [http-client :as http]
             [models :refer [Card Collection Dashboard Pulse PulseCard PulseChannel PulseChannelRecipient]]
             [test :as mt]
             [util :as u]]
            [metabase.api
             [card-test :as card-api-test]
             [pulse :as pulse-api]]
            [metabase.integrations.slack :as slack]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as perms-group]
             [pulse :as pulse]
             [pulse-test :as pulse-test]]
            [metabase.pulse.render.png :as png]
            [metabase.test.mock.util :refer [pulse-channel-defaults]]
            [schema.core :as s]
            [toucan.db :as db]))

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
      (assoc :include_csv false, :include_xls false))) ; why??

(defn- pulse-channel-details [channel]
  (select-keys channel [:schedule_type :schedule_details :channel_type :updated_at :details :pulse_id :id :enabled
                        :created_at]))

(defn- pulse-details [pulse]
  (merge
   (select-keys
    pulse
    [:id :name :created_at :updated_at :creator_id :collection_id :collection_position :archived :skip_if_empty])
   {:creator  (user-details (db/select-one 'User :id (:creator_id pulse)))
    :cards    (map pulse-card-details (:cards pulse))
    :channels (map pulse-channel-details (:channels pulse))}))

(defn- pulse-response [{:keys [created_at updated_at], :as pulse}]
  (-> pulse
      (dissoc :id)
      (assoc :created_at (some? created_at)
             :updated_at (some? updated_at))
      (update :collection_id boolean)
      (update :cards #(for [card %]
                        (update card :collection_id boolean)))))

(defn- do-with-pulses-in-a-collection [grant-collection-perms-fn! pulses-or-ids f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp Collection [collection]
      (grant-collection-perms-fn! (perms-group/all-users) collection)
      ;; use db/execute! instead of db/update! so the updated_at field doesn't get automatically updated!
      (when (seq pulses-or-ids)
        (db/execute! {:update Pulse
                      :set    [[:collection_id (u/get-id collection)]]
                      :where  [:in :id (set (map u/get-id pulses-or-ids))]}))
      (f))))

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
  (is (= (:body middleware.u/response-unauthentic) (http/client :get 401 "pulse")))
  (is (= (:body middleware.u/response-unauthentic) (http/client :put 401 "pulse/13"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                POST /api/pulse                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private default-post-card-ref-validation-error
  {:errors
   {:cards (str "value must be an array. Each value must satisfy one of the following requirements: "
                "1) value must be a map with the following keys "
                "`(collection_id, description, display, id, include_csv, include_xls, name)` "
                "2) value must be a map with the keys `id`, `include_csv`, and `include_xls`. The array cannot be empty.")}})

(deftest create-pulse-validation-test
  (doseq [[input expected-error]
          {{}
           {:errors {:name "value must be a non-blank string."}}

           {:name "abc"}
           default-post-card-ref-validation-error

           {:name  "abc"
            :cards "foobar"}
           default-post-card-ref-validation-error

           {:name  "abc"
            :cards ["abc"]}
           default-post-card-ref-validation-error

           {:name  "abc"
            :cards [{:id 100, :include_csv false, :include_xls false}
                    {:id 200, :include_csv false, :include_xls false}]}
           {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}

           {:name     "abc"
            :cards    [{:id 100, :include_csv false, :include_xls false}
                       {:id 200, :include_csv false, :include_xls false}]
            :channels "foobar"}
           {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}

           {:name     "abc"
            :cards    [{:id 100, :include_csv false, :include_xls false}
                       {:id 200, :include_csv false, :include_xls false}]
            :channels ["abc"]}
           {:errors {:channels "value must be an array. Each value must be a map. The array cannot be empty."}}}]
    (testing (pr-str input)
      (is (= expected-error
             ((mt/user->client :rasta) :post 400 "pulse" input))))))

(defn- remove-extra-channels-fields [channels]
  (for [channel channels]
    (dissoc channel :id :pulse_id :created_at :updated_at)))

(def ^:private pulse-defaults
  {:collection_id       nil
   :collection_position nil
   :created_at          true
   :skip_if_empty       false
   :updated_at          true
   :archived            false})

(def ^:private daily-email-channel
  {:enabled       true
   :channel_type  "email"
   :schedule_type "daily"
   :schedule_hour 12
   :schedule_day  nil
   :recipients    []})

(deftest create-test
  (testing "POST /api/pulse"
    (mt/with-temp* [Card [card-1]
                    Card [card-2]]
      (card-api-test/with-cards-in-readable-collection [card-1 card-2]
        (mt/with-temp Collection [collection]
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
                   (-> ((mt/user->client :rasta) :post 200 "pulse" {:name          "A Pulse"
                                                                    :collection_id (u/get-id collection)
                                                                    :cards         [{:id          (u/get-id card-1)
                                                                                     :include_csv false
                                                                                     :include_xls false}
                                                                                    {:id          (u/get-id card-2)
                                                                                     :include_csv false
                                                                                     :include_xls false}]
                                                                    :channels      [daily-email-channel]
                                                                    :skip_if_empty false})
                       pulse-response
                       (update :channels remove-extra-channels-fields))))))))))

(deftest create-with-hybrid-pulse-card-test
  (testing "POST /api/pulse"
    (testing "Create a pulse with a HybridPulseCard and a CardRef, PUT accepts this format, we should make sure POST does as well"
      (mt/with-temp* [Card [card-1]
                      Card [card-2 {:name        "The card"
                                    :description "Info"
                                    :display     :table}]]
        (card-api-test/with-cards-in-readable-collection [card-1 card-2]
          (mt/with-temp Collection [collection]
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
                     (-> ((mt/user->client :rasta) :post 200 "pulse" {:name          "A Pulse"
                                                                      :collection_id (u/get-id collection)
                                                                      :cards         [{:id          (u/get-id card-1)
                                                                                       :include_csv false
                                                                                       :include_xls false}
                                                                                      (-> card-2
                                                                                          (select-keys [:id :name :description :display :collection_id])
                                                                                          (assoc :include_csv false, :include_xls false))]
                                                                      :channels      [daily-email-channel]
                                                                      :skip_if_empty false})
                         pulse-response
                         (update :channels remove-extra-channels-fields)))))))))))

(deftest create-csv-xls-test
  (testing "POST /api/pulse"
    (testing "Create a pulse with a csv and xls"
      (mt/with-temp* [Card [card-1]
                      Card [card-2]]
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp Collection [collection]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (mt/with-model-cleanup [Pulse]
              (card-api-test/with-cards-in-readable-collection [card-1 card-2]
                (is (= (merge
                        pulse-defaults
                        {:name          "A Pulse"
                         :creator_id    (mt/user->id :rasta)
                         :creator       (user-details (mt/fetch-user :rasta))
                         :cards         [(assoc (pulse-card-details card-1) :include_csv true, :include_xls true, :collection_id true)
                                         (assoc (pulse-card-details card-2) :collection_id true)]
                         :channels      [(merge pulse-channel-defaults
                                                {:channel_type  "email"
                                                 :schedule_type "daily"
                                                 :schedule_hour 12
                                                 :recipients    []})]
                         :collection_id true})
                       (-> ((mt/user->client :rasta) :post 200 "pulse" {:name          "A Pulse"
                                                                        :collection_id (u/get-id collection)
                                                                        :cards         [{:id          (u/get-id card-1)
                                                                                         :include_csv true
                                                                                         :include_xls true}
                                                                                        {:id          (u/get-id card-2)
                                                                                         :include_csv false
                                                                                         :include_xls false}]
                                                                        :channels      [daily-email-channel]
                                                                        :skip_if_empty false})
                           pulse-response
                           (update :channels remove-extra-channels-fields))))))))))))

(deftest create-with-collection-position-test
  (testing "POST /api/pulse"
    (testing "Make sure we can create a Pulse with a Collection position"
      (mt/with-model-cleanup [Pulse]
        (letfn [(create-pulse! [expected-status-code pulse-name card collection]
                  (let [response ((mt/user->client :rasta) :post expected-status-code "pulse"
                                  {:name                pulse-name
                                   :cards               [{:id          (u/get-id card)
                                                          :include_csv false
                                                          :include_xls false}]
                                   :channels            [daily-email-channel]
                                   :skip_if_empty       false
                                   :collection_id       (u/get-id collection)
                                   :collection_position 1})]
                    (testing "response"
                      (is (= nil
                             (:errors response))))))]
          (let [pulse-name (mt/random-name)]
            (mt/with-temp* [Card       [card]
                            Collection [collection]]
              (card-api-test/with-cards-in-readable-collection [card]
                (create-pulse! 200 pulse-name card collection)
                (is (= {:collection_id (u/get-id collection), :collection_position 1}
                       (mt/derecordize (db/select-one [Pulse :collection_id :collection_position] :name pulse-name)))))))

          (testing "...but not if we don't have permissions for the Collection"
            (mt/with-non-admin-groups-no-root-collection-perms
              (let [pulse-name (mt/random-name)]
                (mt/with-temp* [Card       [card]
                                Collection [collection]]
                  (create-pulse! 403 pulse-name card collection)
                  (is (= nil
                         (db/select-one [Pulse :collection_id :collection_position] :name pulse-name))))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PUT /api/pulse/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private default-put-card-ref-validation-error
  {:errors
   {:cards (str "value may be nil, or if non-nil, value must be an array. "
                "Each value must satisfy one of the following requirements: "
                "1) value must be a map with the following keys "
                "`(collection_id, description, display, id, include_csv, include_xls, name)` "
                "2) value must be a map with the keys `id`, `include_csv`, and `include_xls`. The array cannot be empty.")}})

(deftest update-pulse-validation-test
  (testing "PUT /api/pulse/:id"
    (doseq [[input expected-error]
            {{:name 123}
             {:errors {:name "value may be nil, or if non-nil, value must be a non-blank string."}}

             {:cards 123}
             default-put-card-ref-validation-error

             {:cards "foobar"}
             default-put-card-ref-validation-error

             {:cards ["abc"]}
             default-put-card-ref-validation-error

             {:channels 123}
             {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a map. "
                                      "The array cannot be empty.")}}

             {:channels "foobar"}
             {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a map. "
                                      "The array cannot be empty.")}}

             {:channels ["abc"]}
             {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a map. "
                                      "The array cannot be empty.")}}}]
      (testing (pr-str input)
        (is (= expected-error
               ((mt/user->client :rasta) :put 400 "pulse/1" input)))))))

(deftest update-test
  (testing "PUT /api/pulse/:id"
    (mt/with-temp* [Pulse                 [pulse]
                    PulseChannel          [pc    {:pulse_id (u/get-id pulse)}]
                    PulseChannelRecipient [_     {:pulse_channel_id (u/get-id pc), :user_id (mt/user->id :rasta)}]
                    Card                  [card]]
      (with-pulses-in-writeable-collection [pulse]
        (card-api-test/with-cards-in-readable-collection [card]
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
                   :collection_id true})
                 (-> ((mt/user->client :rasta) :put 200 (format "pulse/%d" (u/get-id pulse))
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
                       :skip_if_empty false})
                     pulse-response
                     (update :channels remove-extra-channels-fields)))))))))

(deftest add-card-to-existing-test
  (testing "PUT /api/pulse/:id"
    (testing "Can we add a card to an existing pulse that has a card?"
      ;; Specifically this will include a HybridPulseCard (the original card associated with the pulse) and a CardRef
      ;; (the new card)
      (mt/with-temp* [Pulse                 [pulse {:name "Original Pulse Name"}]
                      Card                  [card-1 {:name        "Test"
                                                     :description "Just Testing"}]
                      PulseCard             [_      {:card_id  (u/get-id card-1)
                                                     :pulse_id (u/get-id pulse)}]
                      Card                  [card-2 {:name        "Test2"
                                                     :description "Just Testing2"}]]
        (with-pulses-in-writeable-collection [pulse]
          (card-api-test/with-cards-in-readable-collection [card-1 card-2]
            ;; The FE will include the original HybridPulseCard, similar to how the API returns the card via GET
            (let [pulse-cards (:cards ((mt/user->client :rasta) :get 200 (format "pulse/%d" (u/get-id pulse))))]
              (is (= (merge
                      pulse-defaults
                      {:name          "Original Pulse Name"
                       :creator_id    (mt/user->id :rasta)
                       :creator       (user-details (mt/fetch-user :rasta))
                       :cards         (mapv (comp #(assoc % :collection_id true) pulse-card-details) [card-1 card-2])
                       :channels      []
                       :collection_id true})
                     (-> ((mt/user->client :rasta) :put 200 (format "pulse/%d" (u/get-id pulse))
                          {:cards (concat pulse-cards
                                          [{:id          (u/get-id card-2)
                                            :include_csv false
                                            :include_xls false}])})
                         pulse-response
                         (update :channels remove-extra-channels-fields)))))))))))

(deftest update-collection-id-test
  (testing "Can we update *just* the Collection ID of a Pulse?"
    (mt/with-temp* [Pulse      [pulse]
                    Collection [collection]]
      ((mt/user->client :crowberto) :put 200 (str "pulse/" (u/get-id pulse))
       {:collection_id (u/get-id collection)})
      (is (= (db/select-one-field :collection_id Pulse :id (u/get-id pulse))
             (u/get-id collection))))))

(deftest change-collection-test
  (testing "Can we change the Collection a Pulse is in (assuming we have the permissions to do so)?"
    (pulse-test/with-pulse-in-collection [db collection pulse]
      (mt/with-temp Collection [new-collection]
        ;; grant Permissions for both new and old collections
        (doseq [coll [collection new-collection]]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
        ;; now make an API call to move collections
        ((mt/user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse)) {:collection_id (u/get-id new-collection)})
        ;; Check to make sure the ID has changed in the DB
        (is (= (db/select-one-field :collection_id Pulse :id (u/get-id pulse))
               (u/get-id new-collection)))))

    (testing "...but if we don't have the Permissions for the old collection, we should get an Exception"
      (pulse-test/with-pulse-in-collection [db collection pulse]
        (mt/with-temp Collection [new-collection]
          ;; grant Permissions for only the *new* collection
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
          ;; now make an API call to move collections. Should fail
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :put 403 (str "pulse/" (u/get-id pulse)) {:collection_id (u/get-id new-collection)}))))))

    (testing "...and if we don't have the Permissions for the new collection, we should get an Exception"
      (pulse-test/with-pulse-in-collection [db collection pulse]
        (mt/with-temp Collection [new-collection]
          ;; grant Permissions for only the *old* collection
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          ;; now make an API call to move collections. Should fail
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :put 403 (str "pulse/" (u/get-id pulse)) {:collection_id (u/get-id new-collection)}))))))))

(deftest update-collection-position-test
  (testing "Can we change the Collection position of a Pulse?"
    (pulse-test/with-pulse-in-collection [_ collection pulse]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((mt/user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
       {:collection_position 1})
      (is (= 1
             (db/select-one-field :collection_position Pulse :id (u/get-id pulse)))))

    (testing "...and unset (unpin) it as well?"
      (pulse-test/with-pulse-in-collection [_ collection pulse]
        (db/update! Pulse (u/get-id pulse) :collection_position 1)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        ((mt/user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
         {:collection_position nil})
        (is (= nil
               (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))))

    (testing "...we shouldn't be able to if we don't have permissions for the Collection"
      (pulse-test/with-pulse-in-collection [_ collection pulse]
        ((mt/user->client :rasta) :put 403 (str "pulse/" (u/get-id pulse))
         {:collection_position 1})
        (is (= nil
               (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))

        (testing "shouldn't be able to unset (unpin) a Pulse"
          (db/update! Pulse (u/get-id pulse) :collection_position 1)
          ((mt/user->client :rasta) :put 403 (str "pulse/" (u/get-id pulse))
           {:collection_position nil})
          (is (= 1
                 (db/select-one-field :collection_position Pulse :id (u/get-id pulse)))))))))

(deftest archive-test
  (testing "Can we archive a Pulse?"
    (pulse-test/with-pulse-in-collection [_ collection pulse]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((mt/user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
       {:archived true})
      (is (= true
             (db/select-one-field :archived Pulse :id (u/get-id pulse)))))))

(deftest unarchive-test
  (testing "Can we unarchive a Pulse?"
    (pulse-test/with-pulse-in-collection [_ collection pulse]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (db/update! Pulse (u/get-id pulse) :archived true)
      ((mt/user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
       {:archived false})
      (is (= false
             (db/select-one-field :archived Pulse :id (u/get-id pulse))))))

  (testing "Does unarchiving a Pulse affect its Cards & Recipients? It shouldn't. This should behave as a PATCH-style endpoint!"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection            [collection]
                      Pulse                 [pulse {:collection_id (u/get-id collection)}]
                      PulseChannel          [pc    {:pulse_id (u/get-id pulse)}]
                      PulseChannelRecipient [pcr   {:pulse_channel_id (u/get-id pc), :user_id (mt/user->id :rasta)}]
                      Card                  [card]]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        ((mt/user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
         {:archived true})
        ((mt/user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
         {:archived false})
        (is (db/exists? PulseChannel :id (u/get-id pc)))
        (is (db/exists? PulseChannelRecipient :id (u/get-id pcr)))))))


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
        response ((mt/user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
                  (merge
                   (when collection
                     {:collection_id (u/get-id (get-in context [:collection collection]))})
                   (when position
                     {:collection_position position})))]
    (is (= nil
           (:errors response)))))

(defmethod move-pulse-test-action :insert-pulse
  [_ context collection & {:keys [position]}]
  (let [collection (get-in context [:collection collection])
        response   ((mt/user->client :rasta) :post 200 "pulse"
                    (merge
                     {:name          "x"
                      :collection_id (u/get-id collection)
                      :cards         [{:id          (u/get-id (get-in context [:card 1]))
                                       :include_csv false
                                       :include_xls false}]
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
        (mt/with-temp* [Collection [collection-1]
                        Collection [collection-2]
                        Card       [card-1]]
          (card-api-test/with-ordered-items collection-1 [Pulse a
                                                          Pulse b
                                                          Pulse c
                                                          Pulse d]
            (card-api-test/with-ordered-items collection-2 [Card      e
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
                         (card-api-test/get-name->collection-position :rasta (u/get-id collection-1)))))
                (when (second expected)
                  (testing "Collection 2"
                    (is (= (second expected)
                           (card-api-test/get-name->collection-position :rasta (u/get-id collection-2))))))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             DELETE /api/pulse/:id                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest delete-test
  (testing "DELETE /api/pulse/:id"
    (testing "check that a regular user can delete a Pulse if they have write permissions for its collection (!)"
      (mt/with-temp* [Pulse                 [pulse]
                      PulseChannel          [pc    {:pulse_id (u/get-id pulse)}]
                      PulseChannelRecipient [_     {:pulse_channel_id (u/get-id pc), :user_id (mt/user->id :rasta)}]]
        (with-pulses-in-writeable-collection [pulse]
          ((mt/user->client :rasta) :delete 204 (format "pulse/%d" (u/get-id pulse)))
          (is (= nil
                 (pulse/retrieve-pulse (u/get-id pulse)))))))

    (testing "check that a rando (e.g. someone without collection write access) isn't allowed to delete a pulse"
      (mt/with-temp-copy-of-db
        (mt/with-temp* [Card      [card  {:dataset_query {:database (mt/id)
                                                          :type     "query"
                                                          :query    {:source-table (mt/id :venues)
                                                                     :aggregation  [[:count]]}}}]
                        Pulse     [pulse {:name "Daily Sad Toucans"}]
                        PulseCard [_     {:pulse_id (u/get-id pulse), :card_id (u/get-id card)}]]
          (with-pulses-in-readable-collection [pulse]
            ;; revoke permissions for default group to this database
            (perms/revoke-permissions! (perms-group/all-users) (mt/id))
            ;; now a user without permissions to the Card in question should *not* be allowed to delete the pulse
            (is (= "You don't have permissions to do that."
                   ((mt/user->client :rasta) :delete 403 (format "pulse/%d" (u/get-id pulse)))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 GET /api/pulse                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest list-test
  (testing "GET /api/pulse"
    (mt/with-temp* [Pulse [pulse-1 {:name "ABCDEF"}]
                    Pulse [pulse-2 {:name "GHIJKL"}]]
      (testing "should come back in alphabetical order"
        (with-pulses-in-readable-collection [pulse-1 pulse-2]
          ;; delete anything else in DB just to be sure; this step may not be necessary any more
          (db/delete! Pulse :id [:not-in #{(u/get-id pulse-1)
                                           (u/get-id pulse-2)}])
          (is (= [(assoc (pulse-details pulse-1) :can_write false, :collection_id true)
                  (assoc (pulse-details pulse-2) :can_write false, :collection_id true)]
                 (for [pulse ((mt/user->client :rasta) :get 200 "pulse")]
                   (update pulse :collection_id boolean))))))

      (testing "`can_write` property should get updated correctly based on whether current user can write"
        ;; delete anything else in DB just to be sure; this step may not be necessary any more
        (db/delete! Pulse :id [:not-in #{(u/get-id pulse-1)
                                         (u/get-id pulse-2)}])
        (is (= [(assoc (pulse-details pulse-1) :can_write true)
                (assoc (pulse-details pulse-2) :can_write true)]
               ((mt/user->client :crowberto) :get 200 "pulse")))))

    (testing "should not return alerts"
      (mt/with-temp* [Pulse [pulse-1 {:name "ABCDEF"}]
                      Pulse [pulse-2 {:name "GHIJKL"}]
                      Pulse [pulse-3 {:name            "AAAAAA"
                                      :alert_condition "rows"}]]
        (with-pulses-in-readable-collection [pulse-1 pulse-2 pulse-3]
          (is (= [(assoc (pulse-details pulse-1) :can_write false, :collection_id true)
                  (assoc (pulse-details pulse-2) :can_write false, :collection_id true)]
                 (for [pulse ((mt/user->client :rasta) :get 200 "pulse")]
                   (update pulse :collection_id boolean)))))))

    (testing "by default, archived Pulses should be excluded"
      (mt/with-temp* [Pulse [not-archived-pulse {:name "Not Archived"}]
                      Pulse [archived-pulse     {:name "Archived", :archived true}]]
        (with-pulses-in-readable-collection [not-archived-pulse archived-pulse]
          (is (= #{"Not Archived"}
                 (set (map :name ((mt/user->client :rasta) :get 200 "pulse"))))))))

    (testing "can we fetch archived Pulses?"
      (mt/with-temp* [Pulse [not-archived-pulse {:name "Not Archived"}]
                      Pulse [archived-pulse     {:name "Archived", :archived true}]]
        (with-pulses-in-readable-collection [not-archived-pulse archived-pulse]
          (is (= #{"Archived"}
                 (set (map :name ((mt/user->client :rasta) :get 200 "pulse?archived=true"))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               GET /api/pulse/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest get-pulse-test
  (testing "GET /api/pulse/:id"
    (mt/with-temp Pulse [pulse]
      (with-pulses-in-readable-collection [pulse]
        (is (= (assoc (pulse-details pulse)
                      :can_write     false
                      :collection_id true)
               (-> ((mt/user->client :rasta) :get 200 (str "pulse/" (u/get-id pulse)))
                   (update :collection_id boolean))))))

    (testing "should 404 for an Alert"
      (mt/with-temp Pulse [{pulse-id :id} {:alert_condition "rows"}]
        (is (= "Not found."
               (with-pulses-in-readable-collection [pulse-id]
                 ((mt/user->client :rasta) :get 404 (str "pulse/" pulse-id)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/pulse/test                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest send-test-pulse-test
  (testing "POST /api/pulse/test"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-fake-inbox
        (mt/dataset sad-toucan-incidents
          (mt/with-temp* [Collection [collection]
                          Card       [card  {:dataset_query (mt/mbql-query incidents {:aggregation [[:count]]})}]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (card-api-test/with-cards-in-readable-collection [card]
              (is (= {:ok true}
                     ((mt/user->client :rasta) :post 200 "pulse/test" {:name          "Daily Sad Toucans"
                                                                       :collection_id (u/get-id collection)
                                                                       :cards         [{:id          (u/get-id card)
                                                                                        :include_csv false
                                                                                        :include_xls false}]
                                                                       :channels      [{:enabled       true
                                                                                        :channel_type  "email"
                                                                                        :schedule_type "daily"
                                                                                        :schedule_hour 12
                                                                                        :schedule_day  nil
                                                                                        :recipients    [(mt/fetch-user :rasta)]}]
                                                                       :skip_if_empty false})))
              (is (= (mt/email-to :rasta {:subject "Pulse: Daily Sad Toucans"
                                          :body    {"Daily Sad Toucans" true}})
                     (mt/regex-email-bodies #"Daily Sad Toucans"))))))))))

;; This test follows a flow that the user/UI would follow by first creating a pulse, then making a small change to
;; that pulse and testing it. The primary purpose of this test is to ensure tha the pulse/test endpoint accepts data
;; of the same format that the pulse GET returns
(deftest update-flow-test
  (mt/with-temp* [Card [card-1 {:dataset_query
                                {:database (mt/id), :type :query, :query {:source-table (mt/id :venues)}}}]
                  Card [card-2 {:dataset_query
                                {:database (mt/id), :type :query, :query {:source-table (mt/id :venues)}}}]]

    (card-api-test/with-cards-in-readable-collection [card-1 card-2]
      (mt/with-fake-inbox
        (mt/with-model-cleanup [Pulse]
          (mt/with-temp Collection [collection]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            ;; First create the pulse
            (let [{pulse-id :id} ((mt/user->client :rasta) :post 200 "pulse"
                                  {:name          "A Pulse"
                                   :collection_id (u/get-id collection)
                                   :skip_if_empty false
                                   :cards         [{:id          (u/get-id card-1)
                                                    :include_csv false
                                                    :include_xls false}
                                                   {:id          (u/get-id card-2)
                                                    :include_csv false
                                                    :include_xls false}]

                                   :channels [(assoc daily-email-channel :recipients [(mt/fetch-user :rasta)
                                                                                      (mt/fetch-user :crowberto)])]})
                  ;; Retrieve the pulse via GET
                  result        ((mt/user->client :rasta) :get 200 (str "pulse/" pulse-id))
                  ;; Change our fetched copy of the pulse to only have Rasta for the recipients
                  email-channel (assoc (-> result :channels first) :recipients [(mt/fetch-user :rasta)])]
              ;; Don't update the pulse, but test the pulse with the updated recipients
              (is (= {:ok true}
                     ((mt/user->client :rasta) :post 200 "pulse/test" (assoc result :channels [email-channel]))))
              (is (= (mt/email-to :rasta {:subject "Pulse: A Pulse"
                                          :body    {"A Pulse" true}})
                     (mt/regex-email-bodies #"A Pulse"))))))))))

(deftest dont-run-cards-async-test
  (testing "A Card saved with `:async?` true should not be ran async for a Pulse"
    (is (map? (#'pulse-api/pulse-card-query-results
               {:id            1
                :dataset_query {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :venues)
                                           :limit        1}
                                :async?   true}})))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         GET /api/pulse/form_input                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest form-input-test
  (testing "GET /api/pulse/form_input"
    (testing "Check that Slack channels come back when configured"
      (mt/with-temporary-setting-values [slack-token "something"]
        (with-redefs [slack/conversations-list (constantly [{:name "foo"}])
                      slack/users-list         (constantly [{:name "bar"}])]
          (is (= [{:name "channel", :type "select", :displayName "Post to", :options ["#foo" "@bar"], :required true}]
                 (-> ((mt/user->client :rasta) :get 200 "pulse/form_input")
                     (get-in [:channels :slack :fields])))))))

    (testing "When slack is not configured, `form_input` returns just the #genreal slack channel"
      (mt/with-temporary-setting-values [slack-token nil]
        (is (= [{:name "channel", :type "select", :displayName "Post to", :options ["#general"], :required true}]
               (-> ((mt/user->client :rasta) :get 200 "pulse/form_input")
                   (get-in [:channels :slack :fields]))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        GET /api/pulse/preview_card/:id                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest preview-pulse-test
  (testing "GET /api/pulse/preview_card/:id"
    (mt/with-temp* [Collection [collection]
                    Card       [card  {:dataset_query (mt/mbql-query checkins {:limit 5})}]]
      (letfn [(preview [expected-status-code]
                (http/client-full-response (mt/user->credentials :rasta)
                                           :get expected-status-code (format "pulse/preview_card_png/%d" (u/get-id card))))]
        (testing "Should be able to preview a Pulse"
          (let [{{:strs [Content-Type]} :headers, :keys [body]} (preview 200)]
            (is (= "image/png"
                   Content-Type))
            (is (some? body))))

        (testing "If rendering a Pulse fails (e.g. because font registration failed) the endpoint should return the error message"
          (with-redefs [png/register-fonts-if-needed! (fn []
                                                        (throw (ex-info "Can't register fonts!"
                                                                        {}
                                                                        (NullPointerException.))))]
            (let [{{:strs [Content-Type]} :headers, :keys [body]} (mt/suppress-output (preview 500))]
              (is (= "application/json;charset=utf-8"
                     Content-Type))
              (is (schema= {:message  (s/eq "Can't register fonts!")
                            :trace    s/Any
                            :via      s/Any
                            s/Keyword s/Any}
                     body)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         DELETE /api/pulse/:pulse-id/subscription                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest delete-subscription-test
  (testing "DELETE /api/pulse/:pulse-id/subscription"
    (mt/with-temp* [Pulse        [{pulse-id :id}   {:name "Lodi Dodi" :creator_id (mt/user->id :crowberto)}]
                    PulseChannel [{channel-id :id} {:pulse_id      pulse-id
                                                    :channel_type  "email"
                                                    :schedule_type "daily"
                                                    :details       {:other  "stuff"
                                                                    :emails ["foo@bar.com"]}}]]
      (testing "Should be able to delete your own subscription"
        (mt/with-temp PulseChannelRecipient [pcr {:pulse_channel_id channel-id :user_id (mt/user->id :rasta)}]
          (is (= nil
                 ((mt/user->client :rasta) :delete 204 (str "pulse/" pulse-id "/subscription/email"))))))

      (testing "Users can't delete someone else's pulse subscription"
        (mt/with-temp PulseChannelRecipient [pcr {:pulse_channel_id channel-id :user_id (mt/user->id :rasta)}]
          (is (= "Not found."
                 ((mt/user->client :lucky) :delete 404 (str "pulse/" pulse-id "/subscription/email")))))))))
