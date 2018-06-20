(ns metabase.api.pulse-test
  "Tests for /api/pulse endpoints."
  (:require [expectations :refer :all]
            [metabase
             [email-test :as et]
             [http-client :as http]
             [middleware :as middleware]
             [util :as u]]
            [metabase.api.card-test :as card-api-test]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [pulse :as pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]
             [pulse-test :as pulse-test]
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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- user-details [user]
  (select-keys user [:email :first_name :last_login :is_qbnewb :is_superuser :id :last_name :date_joined :common_name]))

(defn- pulse-card-details [card]
  (-> (select-keys card [:id :collection_id :name :description :display])
      (update :display name)
      (update :collection_id boolean)
      (assoc :include_csv false, :include_xls false))) ; why??

(defn- pulse-channel-details [channel]
  (select-keys channel [:schedule_type :schedule_details :channel_type :updated_at :details :pulse_id :id :enabled
                        :created_at]))

(defn- pulse-details [pulse]
  (tu/match-$ pulse
    {:id                  $
     :name                $
     :created_at          $
     :updated_at          $
     :creator_id          $
     :creator             (user-details (db/select-one 'User :id (:creator_id pulse)))
     :cards               (map pulse-card-details (:cards pulse))
     :channels            (map pulse-channel-details (:channels pulse))
     :collection_id       $
     :collection_position $
     :archived            $
     :skip_if_empty       $}))

(defn- pulse-response [{:keys [created_at updated_at], :as pulse}]
  (-> pulse
      (dissoc :id)
      (assoc :created_at (some? created_at)
             :updated_at (some? updated_at))
      (update :collection_id boolean)
      (update :cards #(for [card %]
                        (update card :collection_id boolean)))))

(defn- do-with-pulses-in-a-collection [grant-collection-perms-fn! pulses-or-ids f]
  (tt/with-temp Collection [collection]
    (grant-collection-perms-fn! (perms-group/all-users) collection)
    ;; use db/execute! instead of db/update! so the updated_at field doesn't get automatically updated!
    (when (seq pulses-or-ids)
      (db/execute! {:update Pulse
                    :set    [[:collection_id (u/get-id collection)]]
                    :where  [:in :id (set (map u/get-id pulses-or-ids))]}))
    (f)))

(defmacro ^:private with-pulses-in-readable-collection [pulses-or-ids & body]
  `(do-with-pulses-in-a-collection perms/grant-collection-read-permissions! ~pulses-or-ids (fn [] ~@body)))

(defmacro ^:private with-pulses-in-writeable-collection [pulses-or-ids & body]
  `(do-with-pulses-in-a-collection perms/grant-collection-readwrite-permissions! ~pulses-or-ids (fn [] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       /api/pulse/* AUTHENTICATION Tests                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (:body middleware/response-unauthentic) (http/client :get 401 "pulse"))
(expect (:body middleware/response-unauthentic) (http/client :put 401 "pulse/13"))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                POST /api/pulse                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

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

(tt/expect-with-temp [Card [card-1]
                      Card [card-2]]
  (merge
   pulse-defaults
   {:name          "A Pulse"
    :creator_id    (user->id :rasta)
    :creator       (user-details (fetch-user :rasta))
    :cards         (for [card [card-1 card-2]]
                     (assoc (pulse-card-details card)
                       :collection_id true))
    :channels      [(merge pulse-channel-defaults
                           {:channel_type  "email"
                            :schedule_type "daily"
                            :schedule_hour 12
                            :recipients    []})]
    :collection_id true})
  (card-api-test/with-cards-in-readable-collection [card-1 card-2]
    (tt/with-temp Collection [collection]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (tu/with-model-cleanup [Pulse]
        (-> ((user->client :rasta) :post 200 "pulse" {:name          "A Pulse"
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
            (update :channels remove-extra-channels-fields))))))

;; Create a pulse with a csv and xls
(tt/expect-with-temp [Card [card-1]
                      Card [card-2]]
  (merge
   pulse-defaults
   {:name          "A Pulse"
    :creator_id    (user->id :rasta)
    :creator       (user-details (fetch-user :rasta))
    :cards         [(assoc (pulse-card-details card-1) :include_csv true, :include_xls true, :collection_id true)
                    (assoc (pulse-card-details card-2) :collection_id true)]
    :channels      [(merge pulse-channel-defaults
                           {:channel_type  "email"
                            :schedule_type "daily"
                            :schedule_hour 12
                            :recipients    []})]
    :collection_id true})
  (tt/with-temp Collection [collection]
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (tu/with-model-cleanup [Pulse]
      (card-api-test/with-cards-in-readable-collection [card-1 card-2]
        (-> ((user->client :rasta) :post 200 "pulse" {:name          "A Pulse"
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
            (update :channels remove-extra-channels-fields))))))

;; Make sure we can create a Pulse with a Collection position
(expect
  #metabase.models.pulse.PulseInstance{:collection_id true, :collection_position 1}
  (tu/with-model-cleanup [Pulse]
    (let [pulse-name (tu/random-name)]
      (tt/with-temp* [Card       [card]
                      Collection [collection]]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (card-api-test/with-cards-in-readable-collection [card]
          ((user->client :rasta) :post 200 "pulse" {:name                pulse-name
                                                    :cards               [{:id          (u/get-id card)
                                                                           :include_csv false
                                                                           :include_xls false}]
                                                    :channels            [daily-email-channel]
                                                    :skip_if_empty       false
                                                    :collection_id       (u/get-id collection)
                                                    :collection_position 1})
          (some-> (db/select-one [Pulse :collection_id :collection_position] :name pulse-name)
                  (update :collection_id (partial = (u/get-id collection)))))))))

;; ...but not if we don't have permissions for the Collection
(expect
  nil
  (tu/with-model-cleanup [Pulse]
    (let [pulse-name (tu/random-name)]
      (tt/with-temp* [Card       [card]
                      Collection [collection]]
        ((user->client :rasta) :post 403 "pulse" {:name                pulse-name
                                                  :cards               [{:id          (u/get-id card)
                                                                         :include_csv false
                                                                         :include_xls false}]
                                                  :channels            [daily-email-channel]
                                                  :skip_if_empty       false
                                                  :collection_id       (u/get-id collection)
                                                  :collection_position 1})
        (some-> (db/select-one [Pulse :collection_id :collection_position] :name pulse-name)
                (update :collection_id (partial = (u/get-id collection))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               PUT /api/pulse/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

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
  {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a map. "
                           "The array cannot be empty.")}}
  ((user->client :rasta) :put 400 "pulse/1" {:channels 123}))

(expect
  {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a map. "
                           "The array cannot be empty.")}}
  ((user->client :rasta) :put 400 "pulse/1" {:channels "foobar"}))

(expect
  {:errors {:channels (str "value may be nil, or if non-nil, value must be an array. Each value must be a map. "
                           "The array cannot be empty.")}}
  ((user->client :rasta) :put 400 "pulse/1" {:channels ["abc"]}))

(tt/expect-with-temp [Pulse                 [pulse]
                      PulseChannel          [pc    {:pulse_id (u/get-id pulse)}]
                      PulseChannelRecipient [_     {:pulse_channel_id (u/get-id pc), :user_id (user->id :rasta)}]
                      Card                  [card]]
  (merge
   pulse-defaults
   {:name          "Updated Pulse"
    :creator_id    (user->id :rasta)
    :creator       (user-details (fetch-user :rasta))
    :cards         [(assoc (pulse-card-details card)
                      :collection_id true)]
    :channels      [(merge pulse-channel-defaults
                           {:channel_type  "slack"
                            :schedule_type "hourly"
                            :details       {:channels "#general"}
                            :recipients    []})]
    :collection_id true})
  (with-pulses-in-writeable-collection [pulse]
    (card-api-test/with-cards-in-readable-collection [card]
      (-> ((user->client :rasta) :put 200 (format "pulse/%d" (u/get-id pulse))
           {:name          "Updated Pulse"
            :cards         [{:id            (u/get-id card)
                             :include_csv   false
                             :include_xls   false}]
            :channels      [{:enabled       true
                             :channel_type  "slack"
                             :schedule_type "hourly"
                             :schedule_hour 12
                             :schedule_day  "mon"
                             :recipients    []
                             :details       {:channels "#general"}}]
            :skip_if_empty false})
          pulse-response
          (update :channels remove-extra-channels-fields)))))

;; Can we update *just* the Collection ID of a Pulse?
(expect
  (tt/with-temp* [Pulse      [pulse]
                  Collection [collection]]
    ((user->client :crowberto) :put 200 (str "pulse/" (u/get-id pulse))
     {:collection_id (u/get-id collection)})
    (= (db/select-one-field :collection_id Pulse :id (u/get-id pulse))
       (u/get-id collection))))

;; Can we change the Collection a Pulse is in (assuming we have the permissions to do so)?
(expect
  (pulse-test/with-pulse-in-collection [db collection pulse]
    (tt/with-temp Collection [new-collection]
      ;; grant Permissions for both new and old collections
      (doseq [coll [collection new-collection]]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))
      ;; now make an API call to move collections
      ((user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse)) {:collection_id (u/get-id new-collection)})
      ;; Check to make sure the ID has changed in the DB
      (= (db/select-one-field :collection_id Pulse :id (u/get-id pulse))
         (u/get-id new-collection)))))

;; ...but if we don't have the Permissions for the old collection, we should get an Exception
(expect
  "You don't have permissions to do that."
  (pulse-test/with-pulse-in-collection [db collection pulse]
    (tt/with-temp Collection [new-collection]
      ;; grant Permissions for only the *new* collection
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
      ;; now make an API call to move collections. Should fail
      ((user->client :rasta) :put 403 (str "pulse/" (u/get-id pulse)) {:collection_id (u/get-id new-collection)}))))

;; ...and if we don't have the Permissions for the new collection, we should get an Exception
(expect
  "You don't have permissions to do that."
  (pulse-test/with-pulse-in-collection [db collection pulse]
    (tt/with-temp Collection [new-collection]
      ;; grant Permissions for only the *old* collection
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ;; now make an API call to move collections. Should fail
      ((user->client :rasta) :put 403 (str "pulse/" (u/get-id pulse)) {:collection_id (u/get-id new-collection)}))))

;; Can we change the Collection position of a Pulse?
(expect
  1
  (pulse-test/with-pulse-in-collection [_ collection pulse]
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    ((user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
     {:collection_position 1})
    (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))

;; ...and unset (unpin) it as well?
(expect
  nil
  (pulse-test/with-pulse-in-collection [_ collection pulse]
    (db/update! Pulse (u/get-id pulse) :collection_position 1)
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    ((user->client :rasta) :put 200 (str "pulse/" (u/get-id pulse))
     {:collection_position nil})
    (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))

;; ...we shouldn't be able to if we don't have permissions for the Collection
(expect
  nil
  (pulse-test/with-pulse-in-collection [_ collection pulse]
    ((user->client :rasta) :put 403 (str "pulse/" (u/get-id pulse))
     {:collection_position 1})
    (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))

(expect
  1
  (pulse-test/with-pulse-in-collection [_ collection pulse]
    (db/update! Pulse (u/get-id pulse) :collection_position 1)
    ((user->client :rasta) :put 403 (str "pulse/" (u/get-id pulse))
     {:collection_position nil})
    (db/select-one-field :collection_position Pulse :id (u/get-id pulse))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   UPDATING PULSE COLLECTION POSITIONS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that we can update a pulse's position in a collection only pulses
(expect
  {"d" 1
   "a" 2
   "b" 3
   "c" 4}
  (tt/with-temp Collection [{coll-id :id :as collection}]
    (card-api-test/with-ordered-items collection [Pulse a
                                                  Pulse b
                                                  Pulse c
                                                  Pulse d]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :put 200 (str "pulse/" (u/get-id d))
       {:collection_position 1})
      (card-api-test/get-name->collection-position :rasta coll-id))))

;; Change the position of b to 4, will dec c and d
(expect
  {"a" 1
   "c" 2
   "d" 3
   "b" 4}
  (tt/with-temp Collection [{coll-id :id :as collection}]
    (card-api-test/with-ordered-items collection [Card      a
                                                  Pulse     b
                                                  Card      c
                                                  Dashboard d]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :put 200 (str "pulse/" (u/get-id b))
       {:collection_position 4})
      (card-api-test/get-name->collection-position :rasta coll-id))))

;; Change the position of d to the 2, should inc b and c
(expect
  {"a" 1
   "d" 2
   "b" 3
   "c" 4}
  (tt/with-temp Collection [{coll-id :id :as collection}]
    (card-api-test/with-ordered-items collection [Card      a
                                                  Card      b
                                                  Dashboard c
                                                  Pulse     d]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :put 200 (str "pulse/" (u/get-id d))
       {:collection_position 2})
      (card-api-test/get-name->collection-position :rasta coll-id))))

;; Change the position of a to the 4th, will decrement all existing items
(expect
  {"b" 1
   "c" 2
   "d" 3
   "a" 4}
  (tt/with-temp Collection [{coll-id :id :as collection}]
    (card-api-test/with-ordered-items collection [Pulse     a
                                                  Dashboard b
                                                  Card      c
                                                  Pulse     d]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :put 200 (str "pulse/" (u/get-id a))
       {:collection_position 4})
      (card-api-test/get-name->collection-position :rasta coll-id))))

;; Change the position of the d to the 1st, will increment all existing items
(expect
  {"d" 1
   "a" 2
   "b" 3
   "c" 4}
  (tt/with-temp Collection [{coll-id :id :as collection}]
    (card-api-test/with-ordered-items collection [Dashboard a
                                                  Dashboard b
                                                  Card      c
                                                  Pulse     d]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :put 200 (str "pulse/" (u/get-id d))
       {:collection_position 1})
      (card-api-test/get-name->collection-position :rasta coll-id))))

;; Check that no position change, but changing collections still triggers a fixup of both collections
;; Moving `c` from collection-1 to collection-2, `c` is now at position 3 in collection 2
(expect
  [{"a" 1
    "b" 2
    "d" 3}
   {"e" 1
    "f" 2
    "c" 3
    "g" 4
    "h" 5}]
  (tt/with-temp* [Collection [collection-1]
                  Collection [collection-2]]
    (card-api-test/with-ordered-items collection-1 [Pulse     a
                                                    Card      b
                                                    Pulse     c
                                                    Dashboard d]
      (card-api-test/with-ordered-items collection-2 [Card      e
                                                      Card      f
                                                      Dashboard g
                                                      Dashboard h]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-1)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-2)
        ((user->client :rasta) :put 200 (str "pulse/" (u/get-id c))
         {:collection_id (u/get-id collection-2)})
        [(card-api-test/get-name->collection-position :rasta (u/get-id collection-1))
         (card-api-test/get-name->collection-position :rasta (u/get-id collection-2))]))))

;; Check that moving a pulse to another collection, with a changed position will fixup both collections
;; Moving `b` to collection 2, giving it a position of 1
(expect
  [{"a" 1
    "c" 2
    "d" 3}
   {"b" 1
    "e" 2
    "f" 3
    "g" 4
    "h" 5}]
  (tt/with-temp* [Collection [collection-1]
                  Collection [collection-2]]
    (card-api-test/with-ordered-items collection-1 [Pulse     a
                                                    Pulse     b
                                                    Dashboard c
                                                    Card      d]
      (card-api-test/with-ordered-items collection-2 [Card      e
                                                      Card      f
                                                      Pulse     g
                                                      Dashboard h]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-1)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-2)
        ((user->client :rasta) :put 200 (str "pulse/" (u/get-id b))
         {:collection_id (u/get-id collection-2), :collection_position 1})
        [(card-api-test/get-name->collection-position :rasta (u/get-id collection-1))
         (card-api-test/get-name->collection-position :rasta (u/get-id collection-2))]))))

;; Add a new pulse at position 2, causing existing pulses to be incremented
(expect
  [{"a" 1
    "c" 2
    "d" 3}
   {"a" 1
    "b" 2
    "c" 3
    "d" 4}]
  (tt/with-temp* [Collection [{coll-id :id :as collection}]
                  Card       [card-1]]
    (card-api-test/with-cards-in-readable-collection [card-1]
      (card-api-test/with-ordered-items  collection [Card      a
                                                     Dashboard c
                                                     Pulse     d]
        (tu/with-model-cleanup [Pulse]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          [(card-api-test/get-name->collection-position :rasta coll-id)
           (do ((user->client :rasta) :post 200 "pulse" {:name                "b"
                                                         :collection_id       (u/get-id collection)
                                                         :cards               [{:id          (u/get-id card-1)
                                                                                :include_csv false
                                                                                :include_xls false}]
                                                         :channels            [daily-email-channel]
                                                         :skip_if_empty       false
                                                         :collection_position 2})
               (card-api-test/get-name->collection-position :rasta coll-id))])))))

;; Add a new pulse without a position, should leave existing positions unchanged
(expect
  [{"a" 1
    "c" 2
    "d" 3}
   {"a" 1
    "b" nil
    "c" 2
    "d" 3}]
  (tt/with-temp* [Collection [{coll-id :id :as collection}]
                  Card       [card-1]]
    (card-api-test/with-cards-in-readable-collection [card-1]
      (card-api-test/with-ordered-items collection [Pulse     a
                                                    Card      c
                                                    Dashboard d]
        (tu/with-model-cleanup [Pulse]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          [(card-api-test/get-name->collection-position :rasta coll-id)
           (do ((user->client :rasta) :post 200 "pulse" {:name                "b"
                                                         :collection_id       (u/get-id collection)
                                                         :cards               [{:id          (u/get-id card-1)
                                                                                :include_csv false
                                                                                :include_xls false}]
                                                         :channels            [daily-email-channel]
                                                         :skip_if_empty       false})
               (card-api-test/get-name->collection-position :rasta coll-id))])))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             DELETE /api/pulse/:id                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; check that a regular user can delete a Pulse if they have write permissions for its collection (!)
(expect
  nil
  (tt/with-temp* [Pulse                 [pulse]
                  PulseChannel          [pc    {:pulse_id (u/get-id pulse)}]
                  PulseChannelRecipient [_     {:pulse_channel_id (u/get-id pc), :user_id (user->id :rasta)}]]
    (with-pulses-in-writeable-collection [pulse]
      ((user->client :rasta) :delete 204 (format "pulse/%d" (u/get-id pulse)))
      (pulse/retrieve-pulse (u/get-id pulse)))))

;; Check that a rando (e.g. someone without collection write access) isn't allowed to delete a pulse
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Database  [db]
                  Table     [table {:db_id (u/get-id db)}]
                  Card      [card  {:dataset_query {:database (u/get-id db)
                                                    :type     "query"
                                                    :query    {:source-table (u/get-id table)
                                                               :aggregation  {:aggregation-type "count"}}}}]
                  Pulse     [pulse {:name "Daily Sad Toucans"}]
                  PulseCard [_     {:pulse_id (u/get-id pulse), :card_id (u/get-id card)}]]
    (with-pulses-in-readable-collection [pulse]
      ;; revoke permissions for default group to this database
      (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path (u/get-id db)))
      ;; now a user without permissions to the Card in question should *not* be allowed to delete the pulse
      ((user->client :rasta) :delete 403 (format "pulse/%d" (u/get-id pulse))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 GET /api/pulse                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; should come back in alphabetical order
(tt/expect-with-temp [Pulse [pulse-1 {:name "ABCDEF"}]
                      Pulse [pulse-2 {:name "GHIJKL"}]]
  [(assoc (pulse-details pulse-1) :read_only true, :collection_id true)
   (assoc (pulse-details pulse-2) :read_only true, :collection_id true)]
  (with-pulses-in-readable-collection [pulse-1 pulse-2]
    ;; delete anything else in DB just to be sure; this step may not be neccesary any more
    (db/delete! Pulse :id [:not-in #{(u/get-id pulse-1)
                                     (u/get-id pulse-2)}])
    (for [pulse ((user->client :rasta) :get 200 "pulse")]
      (update pulse :collection_id boolean))))

;; `read_only` property should get updated correctly based on whether current user can write
(tt/expect-with-temp [Pulse [pulse-1 {:name "ABCDEF"}]
                      Pulse [pulse-2 {:name "GHIJKL"}]]
  [(assoc (pulse-details pulse-1) :read_only false)
   (assoc (pulse-details pulse-2) :read_only false)]
  (do
    ;; delete anything else in DB just to be sure; this step may not be neccesary any more
    (db/delete! Pulse :id [:not-in #{(u/get-id pulse-1)
                                     (u/get-id pulse-2)}])
    ((user->client :crowberto) :get 200 "pulse")))

;; should not return alerts
(tt/expect-with-temp [Pulse [pulse-1 {:name "ABCDEF"}]
                      Pulse [pulse-2 {:name "GHIJKL"}]
                      Pulse [pulse-3 {:name            "AAAAAA"
                                      :alert_condition "rows"}]]
  [(assoc (pulse-details pulse-1) :read_only true, :collection_id true)
   (assoc (pulse-details pulse-2) :read_only true, :collection_id true)]
  (with-pulses-in-readable-collection [pulse-1 pulse-2 pulse-3]
    (for [pulse ((user->client :rasta) :get 200 "pulse")]
      (update pulse :collection_id boolean))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               GET /api/pulse/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(tt/expect-with-temp [Pulse [pulse]]
  (assoc (pulse-details pulse)
    :collection_id true)
  (with-pulses-in-readable-collection [pulse]
    (-> ((user->client :rasta) :get 200 (str "pulse/" (u/get-id pulse)))
        (update :collection_id boolean))))

;; Should 404 for an Alert
(expect
  "Not found."
  (tt/with-temp Pulse [{pulse-id :id} {:alert_condition "rows"}]
    (with-pulses-in-readable-collection [pulse-id]
      ((user->client :rasta) :get 404 (str "pulse/" pulse-id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/pulse/test                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  {:response {:ok true}
   :emails   (et/email-to :rasta {:subject "Pulse: Daily Sad Toucans"
                                  :body    {"Daily Sad Toucans" true}})}
  (tu/with-model-cleanup [Pulse]
    (et/with-fake-inbox
      (data/with-db (data/get-or-create-database! defs/sad-toucan-incidents)
        (tt/with-temp* [Collection [collection]
                        Database   [db]
                        Table      [table {:db_id (u/get-id db)}]
                        Card       [card  {:dataset_query {:database (u/get-id db)
                                                           :type     "query"
                                                           :query    {:source-table (u/get-id table),
                                                                      :aggregation  {:aggregation-type "count"}}}}]]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (card-api-test/with-cards-in-readable-collection [card]
            (array-map
             :response
             ((user->client :rasta) :post 200 "pulse/test" {:name          "Daily Sad Toucans"
                                                            :collection_id (u/get-id collection)
                                                            :cards         [{:id          (u/get-id card)
                                                                             :include_csv false
                                                                             :include_xls false}]
                                                            :channels      [{:enabled       true
                                                                             :channel_type  "email"
                                                                             :schedule_type "daily"
                                                                             :schedule_hour 12
                                                                             :schedule_day  nil
                                                                             :recipients    [(fetch-user :rasta)]}]
                                                            :skip_if_empty false})

             :emails
             (et/regex-email-bodies #"Daily Sad Toucans"))))))))
