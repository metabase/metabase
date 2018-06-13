(ns metabase.api.card-test
  "Tests for /api/card endpoints."
  (:require [cheshire.core :as json]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase
             [email-test :as et]
             [http-client :as http :refer :all]
             [middleware :as middleware]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [card-label :refer [CardLabel]]
             [collection :refer [Collection]]
             [database :refer [Database]]
             [label :refer [Label]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [pulse :as pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]
             [table :refer [Table]]
             [view-log :refer [ViewLog]]]
            [metabase.query-processor.middleware.results-metadata :as results-metadata]
            [metabase.test
             [data :as data :refer :all]
             [util :as tu :refer [match-$ random-name]]]
            [metabase.test.data.users :refer :all]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.io.ByteArrayInputStream
           java.util.UUID))

;;; Helpers

(def ^:const card-defaults
  {:archived          false
   :collection_id     nil
   :description       nil
   :display           "scalar"
   :enable_embedding  false
   :embedding_params  nil
   :made_public_by_id nil
   :public_uuid       nil
   :query_type        "query"
   :cache_ttl         nil
   :result_metadata   nil})

(defn- do-with-self-cleaning-random-card-name
  "Generate a random card name (or use CARD-NAME), pass it to F, then delete any Cards with that name afterwords."
  [f & [card-name]]
  (let [card-name (or card-name (random-name))]
    (try (f card-name)
         (finally (db/delete! Card :name card-name)))))

(defmacro ^:private with-self-cleaning-random-card-name
  "Generate a random card name (or optionally use CARD-NAME) and bind it to CARD-NAME-BINDING.
   Execute BODY and then delete and Cards with that name afterwards."
  {:style/indent 1, :arglists '([[card-name-binding] & body] [[card-name-binding card-name] & body])}
  [[card-name-binding card-name] & body]
  `(do-with-self-cleaning-random-card-name (fn [~card-name-binding]
                                             ~@body)
                                           ~@(when card-name [card-name])))

(defn- mbql-count-query [database-id table-id]
  {:database database-id
   :type     "query"
   :query    {:source-table table-id, :aggregation {:aggregation-type "count"}}})

(defn- card-with-name-and-query [card-name query]
  {:name                   card-name
   :display                "scalar"
   :dataset_query          query
   :visualization_settings {:global {:title nil}}})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           FETCHING CARDS & FILTERING                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Filter cards by database
(expect
  [true
   false
   true]
  (tt/with-temp* [Database [{db-id :id}]
                  Card     [{card-1-id :id} {:database_id (id)}]
                  Card     [{card-2-id :id} {:database_id db-id}]]
    (let [card-returned? (fn [database-id card-id]
                           (contains? (set (for [card ((user->client :rasta) :get 200 "card"
                                                       :f :database, :model_id database-id)]
                                             (u/get-id card)))
                                      card-id))]
      [(card-returned? (id) card-1-id)
       (card-returned? db-id card-1-id)
       (card-returned? db-id card-2-id)])))


(expect (get middleware/response-unauthentic :body) (http/client :get 401 "card"))
(expect (get middleware/response-unauthentic :body) (http/client :put 401 "card/13"))


;; Make sure `model_id` is required when `f` is :database
(expect {:errors {:model_id "model_id is a required parameter when filter mode is 'database'"}}
  ((user->client :crowberto) :get 400 "card" :f :database))

;; Filter cards by table
(defn- card-returned? [table-id card-id]
  (contains? (set (for [card ((user->client :rasta) :get 200 "card", :f :table, :model_id table-id)]
                    (u/get-id card)))
             card-id))

(expect
  [true
   false
   true]
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-1-id :id}  {:db_id database-id}]
                  Table    [{table-2-id :id}  {:db_id database-id}]
                  Card     [{card-1-id :id}   {:table_id table-1-id}]
                  Card     [{card-2-id :id}   {:table_id table-2-id}]]
    [(card-returned? table-1-id card-1-id)
     (card-returned? table-2-id card-1-id)
     (card-returned? table-2-id card-2-id)]))

;; Make sure `model_id` is required when `f` is :table
(expect {:errors {:model_id "model_id is a required parameter when filter mode is 'table'"}}
        ((user->client :crowberto) :get 400 "card", :f :table))


;;; Filter by `recent`
;; Should return cards that were recently viewed by current user only
(tt/expect-with-temp [Card     [{card-1-id :id}]
                      Card     [{card-2-id :id}]
                      Card     [{card-3-id :id}]
                      Card     [{card-4-id :id}]
                      ;; 3 was viewed most recently, followed by 4, then 1. Card 2 was viewed by a different user so
                      ;; shouldn't be returned
                      ViewLog  [_ {:model "card", :model_id card-1-id, :user_id (user->id :rasta)
                                   :timestamp (u/->Timestamp #inst "2015-12-01")}]
                      ViewLog  [_ {:model "card", :model_id card-2-id, :user_id (user->id :trashbird)
                                   :timestamp (u/->Timestamp #inst "2016-01-01")}]
                      ViewLog  [_ {:model "card", :model_id card-3-id, :user_id (user->id :rasta)
                                   :timestamp (u/->Timestamp #inst "2016-02-01")}]
                      ViewLog  [_ {:model "card", :model_id card-4-id, :user_id (user->id :rasta)
                                   :timestamp (u/->Timestamp #inst "2016-03-01")}]
                      ViewLog  [_ {:model "card", :model_id card-3-id, :user_id (user->id :rasta)
                                   :timestamp (u/->Timestamp #inst "2016-04-01")}]]
  [card-3-id card-4-id card-1-id]
  (mapv :id ((user->client :rasta) :get 200 "card", :f :recent)))

;;; Filter by `popular`
;; `f=popular` should return cards sorted by number of ViewLog entries for all users; cards with no entries should be
;; excluded
(tt/expect-with-temp [Card     [{card-1-id :id}]
                      Card     [{card-2-id :id}]
                      Card     [{card-3-id :id}]
                      ;; 3 entries for card 3, 2 for card 2, none for card 1,
                      ViewLog  [_               {:model "card", :model_id card-3-id, :user_id (user->id :rasta)}]
                      ViewLog  [_               {:model "card", :model_id card-2-id, :user_id (user->id :trashbird)}]
                      ViewLog  [_               {:model "card", :model_id card-2-id, :user_id (user->id :rasta)}]
                      ViewLog  [_               {:model "card", :model_id card-3-id, :user_id (user->id :crowberto)}]
                      ViewLog  [_               {:model "card", :model_id card-3-id, :user_id (user->id :rasta)}]]
  [card-3-id card-2-id]
  (map :id ((user->client :rasta) :get 200 "card", :f :popular)))

;;; Filter by `archived`
;; check that the set of Card IDs returned with f=archived is equal to the set of archived cards
(tt/expect-with-temp [Card [{card-1-id :id}]
                      Card [{card-2-id :id} {:archived true}]
                      Card [{card-3-id :id} {:archived true}]]
  #{card-2-id card-3-id}
  (set (map :id ((user->client :rasta) :get 200 "card", :f :archived))))

;;; Filter by `fav`
(tt/expect-with-temp [Card         [{card-id-1 :id}]
                      Card         [{card-id-2 :id}]
                      Card         [{card-id-3 :id}]
                      CardFavorite [_ {:card_id card-id-1, :owner_id (user->id :rasta)}]
                      CardFavorite [_ {:card_id card-id-2, :owner_id (user->id :crowberto)}]]
  [{:id card-id-1, :favorite true}]
  (for [card ((user->client :rasta) :get 200 "card", :f :fav)]
    (select-keys card [:id :favorite])))

;;; Filter by labels
(tt/expect-with-temp [Card      [{card-1-id :id}]
                      Card      [{card-2-id :id}]
                      Label     [{label-1-id :id} {:name "Toucans"}]                   ; slug will be `toucans`
                      Label     [{label-2-id :id} {:name "More Toucans"}]              ; slug will be `more_toucans`
                      CardLabel [_                {:card_id card-1-id, :label_id label-1-id}]
                      CardLabel [_                {:card_id card-2-id, :label_id label-2-id}]]
  ;; When filtering by `more_toucans` only the second Card should get returned
  [card-2-id]
  (map :id ((user->client :rasta) :get 200 "card", :label "more_toucans")))            ; filtering is done by slug


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                CREATING A CARD                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Test that we can make a card
(let [card-name (random-name)]
  (tt/expect-with-temp [Database [{database-id :id}]
                        Table    [{table-id :id}  {:db_id database-id}]]
    (merge card-defaults
           {:name                   card-name
            :creator_id             (user->id :rasta)
            :dataset_query          (mbql-count-query database-id table-id)
            :visualization_settings {:global {:title nil}}
            :database_id            database-id ; these should be inferred automatically
            :table_id               table-id
            :labels                 []
            :can_write              true
            :dashboard_count        0
            :collection             nil
            :read_permissions       [(format "/db/%d/schema//table/%d/" database-id table-id)]
            :creator                (match-$ (fetch-user :rasta)
                                      {:common_name  "Rasta Toucan"
                                       :is_superuser false
                                       :is_qbnewb    true
                                       :last_login   $
                                       :last_name    "Toucan"
                                       :first_name   "Rasta"
                                       :date_joined  $
                                       :email        "rasta@metabase.com"
                                       :id           $})})
    (with-self-cleaning-random-card-name [_ card-name]
      (dissoc ((user->client :rasta) :post 200 "card"
               (card-with-name-and-query card-name (mbql-count-query database-id table-id)))
              :created_at :updated_at :id))))

;; Make sure when saving a Card the query metadata is saved (if correct)
(expect
  [{:base_type    "type/Integer"
    :display_name "Count Chocula"
    :name         "count_chocula"
    :special_type "type/Number"}]
  (let [metadata [{:base_type    :type/Integer
                   :display_name "Count Chocula"
                   :name         "count_chocula"
                   :special_type :type/Number}]]
    (with-self-cleaning-random-card-name [card-name]
      ;; create a card with the metadata
      ((user->client :rasta) :post 200 "card"
       (assoc (card-with-name-and-query card-name (mbql-count-query (data/id) (data/id :venues)))
         :result_metadata    metadata
         :metadata_checksum  (#'results-metadata/metadata-checksum metadata)))
      ;; now check the metadata that was saved in the DB
      (db/select-one-field :result_metadata Card :name card-name))))

;; make sure when saving a Card the correct query metadata is fetched (if incorrect)
(expect
  [{:base_type    "type/Integer"
    :display_name "count"
    :name         "count"
    :special_type "type/Number"}]
  (let [metadata [{:base_type    :type/Integer
                   :display_name "Count Chocula"
                   :name         "count_chocula"
                   :special_type :type/Number}]]
    (with-self-cleaning-random-card-name [card-name]
      ;; create a card with the metadata
      ((user->client :rasta) :post 200 "card"
       (assoc (card-with-name-and-query card-name (mbql-count-query (data/id) (data/id :venues)))
         :result_metadata    metadata
         :metadata_checksum  "ABCDEF")) ; bad checksum
      ;; now check the correct metadata was fetched and was saved in the DB
      (db/select-one-field :result_metadata Card :name card-name))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            FETCHING A SPECIFIC CARD                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Test that we can fetch a card
(tt/expect-with-temp [Database  [{database-id :id}]
                      Table     [{table-id :id}   {:db_id database-id}]
                      Card      [card             {:dataset_query (mbql-count-query database-id table-id)}]]
  (merge card-defaults
         (match-$ card
           {:dashboard_count        0
            :name                   $
            :creator_id             (user->id :rasta)
            :creator                (match-$ (fetch-user :rasta)
                                      {:common_name  "Rasta Toucan"
                                       :is_superuser false
                                       :is_qbnewb    true
                                       :last_login   $
                                       :last_name    "Toucan"
                                       :first_name   "Rasta"
                                       :date_joined  $
                                       :email        "rasta@metabase.com"
                                       :id           $})
            :updated_at             $
            :dataset_query          $
            :read_permissions       [(format "/db/%d/schema//table/%d/" database-id table-id)]
            :id                     $
            :display                "table"
            :visualization_settings {}
            :can_write              true
            :created_at             $
            :database_id            database-id ; these should be inferred from the dataset_query
            :table_id               table-id
            :in_public_dashboard    false
            :collection             nil
            :labels                 []}))
  ((user->client :rasta) :get 200 (str "card/" (u/get-id card))))

;; Check that a user without permissions isn't allowed to fetch the card
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Card     [card              {:dataset_query (mbql-count-query database-id table-id)}]]
    ;; revoke permissions for default group to this database
    (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path database-id))
    ;; now a non-admin user shouldn't be able to fetch this card
    ((user->client :rasta) :get 403 (str "card/" (u/get-id card)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                UPDATING A CARD                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; updating a card that doesn't exist should give a 404
(expect "Not found."
  ((user->client :crowberto) :put 404 "card/12345"))

;; Test that we can edit a Card
(let [updated-name (random-name)]
  (tt/expect-with-temp [Card [{card-id :id, original-name :name}]]
    [original-name
     updated-name]
    [(db/select-one-field :name Card, :id card-id)
     (do ((user->client :rasta) :put 200 (str "card/" card-id) {:name updated-name})
         (db/select-one-field :name Card, :id card-id))]))

(defmacro ^:private with-temp-card {:style/indent 1} [binding & body]
  `(tt/with-temp Card ~binding
     ~@body))

;; Can we update a Card's archived status?
(expect
  [false true false]
  (with-temp-card [{:keys [id]}]
    (let [archived?     (fn [] (:archived (Card id)))
          set-archived! (fn [archived]
                          ((user->client :rasta) :put 200 (str "card/" id) {:archived archived})
                          (archived?))]
      [(archived?)
       (set-archived! true)
       (set-archived! false)])))

;; Can we clear the description of a Card? (#4738)
(expect
  nil
  (with-temp-card [card {:description "What a nice Card"}]
    ((user->client :rasta) :put 200 (str "card/" (u/get-id card)) {:description nil})
    (db/select-one-field :description Card :id (u/get-id card))))

;; description should be blankable as well
(expect
  ""
  (with-temp-card [card {:description "What a nice Card"}]
    ((user->client :rasta) :put 200 (str "card/" (u/get-id card)) {:description ""})
    (db/select-one-field :description Card :id (u/get-id card))))

;; Can we update a card's embedding_params?
(expect
  {:abc "enabled"}
  (with-temp-card [card]
    (tu/with-temporary-setting-values [enable-embedding true]
      ((user->client :crowberto) :put 200 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))
    (db/select-one-field :embedding_params Card :id (u/get-id card))))

;; We shouldn't be able to update them if we're not an admin...
(expect
  "You don't have permissions to do that."
  (with-temp-card [card]
    (tu/with-temporary-setting-values [enable-embedding true]
      ((user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))))

;; ...or if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (with-temp-card [card]
    (tu/with-temporary-setting-values [enable-embedding false]
      ((user->client :crowberto) :put 400 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))))

;; make sure when updating a Card the query metadata is saved (if correct)
(expect
  [{:base_type    "type/Integer"
    :display_name "Count Chocula"
    :name         "count_chocula"
    :special_type "type/Number"}]
  (let [metadata [{:base_type    :type/Integer
                   :display_name "Count Chocula"
                   :name         "count_chocula"
                   :special_type :type/Number}]]
    (tt/with-temp Card [card]
      ;; update the Card's query
      ((user->client :rasta) :put 200 (str "card/" (u/get-id card))
       {:dataset_query (mbql-count-query (data/id) (data/id :venues))
        :result_metadata    metadata
        :metadata_checksum  (#'results-metadata/metadata-checksum metadata)})
      ;; now check the metadata that was saved in the DB
      (db/select-one-field :result_metadata Card :id (u/get-id card)))))

;; Make sure when updating a Card the correct query metadata is fetched (if incorrect)
(expect
  [{:base_type    "type/Integer"
    :display_name "count"
    :name         "count"
    :special_type "type/Number"}]
  (let [metadata [{:base_type    :type/Integer
                   :display_name "Count Chocula"
                   :name         "count_chocula"
                   :special_type :type/Number}]]
    (tt/with-temp Card [card]
      ;; update the Card's query
      ((user->client :rasta) :put 200 (str "card/" (u/get-id card))
       {:dataset_query (mbql-count-query (data/id) (data/id :venues))
        :result_metadata    metadata
        :metadata_checksum  "ABC123"})  ; invalid checksum
      ;; now check the metadata that was saved in the DB
      (db/select-one-field :result_metadata Card :id (u/get-id card)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Card updates that impact alerts                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- rasta-alert-not-working [body-map]
  (et/email-to :rasta {:subject "One of your alerts has stopped working",
                       :body body-map}))

(defn- crowberto-alert-not-working [body-map]
  (et/email-to :crowberto {:subject "One of your alerts has stopped working",
                           :body body-map}))

;; Validate archiving a card trigers alert deletion
(tt/expect-with-temp [Card  [{card-id :id :as card}]
                      Pulse [{pulse-id :id}                 {:alert_condition   "rows"
                                                             :alert_first_only  false
                                                             :creator_id        (user->id :rasta)
                                                             :name              "Original Alert Name"}]

                      PulseCard             [_              {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id-1 :id} {:user_id          (user->id :crowberto)
                                                             :pulse_channel_id pc-id}]
                      PulseChannelRecipient [{pcr-id-2 :id} {:user_id          (user->id :rasta)
                                                             :pulse_channel_id pc-id}]]
  [(merge (crowberto-alert-not-working {"the question was archived by Rasta Toucan" true})
          (rasta-alert-not-working {"the question was archived by Rasta Toucan" true}))
   nil]
  (et/with-fake-inbox
    (et/with-expected-messages 2
      ((user->client :rasta) :put 200 (str "card/" card-id) {:archived true}))
    [(et/regex-email-bodies #"the question was archived by Rasta Toucan")
     (Pulse pulse-id)]))

;; Validate changing a display type trigers alert deletion
(tt/expect-with-temp [Card  [{card-id :id :as card}         {:display :table}]
                      Pulse [{pulse-id :id}                 {:alert_condition   "rows"
                                                             :alert_first_only  false
                                                             :creator_id        (user->id :rasta)
                                                             :name              "Original Alert Name"}]

                      PulseCard             [_              {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id-1 :id} {:user_id          (user->id :crowberto)
                                                             :pulse_channel_id pc-id}]
                      PulseChannelRecipient [{pcr-id-2 :id} {:user_id          (user->id :rasta)
                                                             :pulse_channel_id pc-id}]]
  [(merge (crowberto-alert-not-working {"the question was edited by Rasta Toucan" true})
          (rasta-alert-not-working {"the question was edited by Rasta Toucan" true}))

   nil]
  (et/with-fake-inbox
    (et/with-expected-messages 2
      ((user->client :rasta) :put 200 (str "card/" card-id) {:display :line}))
    [(et/regex-email-bodies #"the question was edited by Rasta Toucan")
     (Pulse pulse-id)]))

;; Changing the display type from line to table should force a delete
(tt/expect-with-temp [Card  [{card-id :id :as card}       {:display                :line
                                                           :visualization_settings {:graph.goal_value 10}}]
                      Pulse [{pulse-id :id}               {:alert_condition  "goal"
                                                           :alert_first_only false
                                                           :creator_id       (user->id :rasta)
                                                           :name             "Original Alert Name"}]
                      PulseCard             [_            {:pulse_id pulse-id
                                                           :card_id  card-id
                                                           :position 0}]
                      PulseChannel          [{pc-id :id}  {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id :id} {:user_id          (user->id :rasta)
                                                           :pulse_channel_id pc-id}]]
  [(rasta-alert-not-working {"the question was edited by Rasta Toucan" true})
   nil]
  (et/with-fake-inbox
    (et/with-expected-messages 1
      ((user->client :rasta) :put 200 (str "card/" card-id) {:display :table}))
    [(et/regex-email-bodies #"the question was edited by Rasta Toucan")
     (Pulse pulse-id)]))

;; Changing the display type from line to area/bar is fine and doesn't delete the alert
(tt/expect-with-temp [Card  [{card-id :id :as card}       {:display                :line
                                                           :visualization_settings {:graph.goal_value 10}}]
                      Pulse [{pulse-id :id}               {:alert_condition  "goal"
                                                           :alert_first_only false
                                                           :creator_id       (user->id :rasta)
                                                           :name             "Original Alert Name"}]
                      PulseCard             [_            {:pulse_id pulse-id
                                                           :card_id  card-id
                                                           :position 0}]
                      PulseChannel          [{pc-id :id}  {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id :id} {:user_id          (user->id :rasta)
                                                           :pulse_channel_id pc-id}]]
  [{} true {} true]
  (et/with-fake-inbox
    [(do
       ((user->client :rasta) :put 200 (str "card/" card-id) {:display :area})
       (et/regex-email-bodies #"the question was edited by Rasta Toucan"))
     (boolean (Pulse pulse-id))
     (do
       ((user->client :rasta) :put 200 (str "card/" card-id) {:display :bar})
       (et/regex-email-bodies #"the question was edited by Rasta Toucan"))
     (boolean (Pulse pulse-id))]))

;; Removing the goal value will trigger the alert to be deleted
(tt/expect-with-temp [Card  [{card-id :id :as card}       {:display                :line
                                                           :visualization_settings {:graph.goal_value 10}}]
                      Pulse [{pulse-id :id}               {:alert_condition  "goal"
                                                           :alert_first_only false
                                                           :creator_id       (user->id :rasta)
                                                           :name             "Original Alert Name"}]
                      PulseCard             [_            {:pulse_id pulse-id
                                                           :card_id  card-id
                                                           :position 0}]
                      PulseChannel          [{pc-id :id}  {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id :id} {:user_id          (user->id :rasta)
                                                           :pulse_channel_id pc-id}]]
  [(rasta-alert-not-working {"the question was edited by Rasta Toucan" true})
   nil]
  (et/with-fake-inbox
    (et/with-expected-messages 1
      ((user->client :rasta) :put 200 (str "card/" card-id) {:visualization_settings {:something "else"}}))
    [(et/regex-email-bodies #"the question was edited by Rasta Toucan")
     (Pulse pulse-id)]))

;; Adding an additional breakout will cause the alert to be removed
(tt/expect-with-temp [Card
                      [card {:display                :line
                             :visualization_settings {:graph.goal_value 10}
                             :dataset_query          (assoc-in
                                                      (mbql-count-query (data/id) (data/id :checkins))
                                                      [:query :breakout]
                                                      [["datetime-field" (data/id :checkins :date) "hour"]])}]

                      Pulse
                      [{pulse-id :id} {:alert_condition  "goal"
                                       :alert_first_only false
                                       :creator_id       (user->id :rasta)
                                       :name             "Original Alert Name"}]

                      PulseCard
                      [_ {:pulse_id pulse-id
                          :card_id  (u/get-id card)
                          :position 0}]

                      PulseChannel
                      [{pc-id :id}  {:pulse_id pulse-id}]

                      PulseChannelRecipient
                      [{pcr-id :id} {:user_id          (user->id :rasta)
                                     :pulse_channel_id pc-id}]]
  [(rasta-alert-not-working {"the question was edited by Crowberto Corv" true})
   nil]
  (et/with-fake-inbox
    (et/with-expected-messages 1
      ((user->client :crowberto) :put 200 (str "card/" (u/get-id card))
       {:dataset_query (assoc-in (mbql-count-query (data/id) (data/id :checkins))
                                 [:query :breakout] [["datetime-field" (data/id :checkins :date) "hour"]
                                                     ["datetime-field" (data/id :checkins :date) "minute"]])}))
    [(et/regex-email-bodies #"the question was edited by Crowberto Corv")
     (Pulse pulse-id)]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DELETING A CARD (DEPRECATED)                                          |
;;; +----------------------------------------------------------------------------------------------------------------+
;; Deprecated because you're not supposed to delete cards anymore. Archive them instead

;; Check that we can delete a card
(expect
  nil
  (with-temp-card [{:keys [id]}]
    ((user->client :rasta) :delete 204 (str "card/" id))
    (Card id)))

;; deleting a card that doesn't exist should return a 404 (#1957)
(expect
  "Not found."
  ((user->client :crowberto) :delete 404 "card/12345"))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   FAVORITING                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Helper Functions
(defn- fave? [card]
  (db/exists? CardFavorite, :card_id (u/get-id card), :owner_id (user->id :rasta)))

(defn- fave! [card]
  ((user->client :rasta) :post 200 (format "card/%d/favorite" (u/get-id card))))

(defn- unfave! [card]
  ((user->client :rasta) :delete 204 (format "card/%d/favorite" (u/get-id card))))

;; ## GET /api/card/:id/favorite
;; Can we see if a Card is a favorite ?
(expect
  false
  (with-temp-card [card]
    (fave? card)))

;; ## POST /api/card/:id/favorite
;; Can we favorite a card?
(expect
  [false
   true]
  (with-temp-card [card]
    [(fave? card)
     (do (fave! card)
         (fave? card))]))

;; DELETE /api/card/:id/favorite
;; Can we unfavorite a card?
(expect
  [false
   true
   false]
  (with-temp-card [card]
    [(fave? card)
     (do (fave! card)
         (fave? card))
     (do (unfave! card)
         (fave? card))]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              LABELS (DEPRECATED)                                               |
;;; +----------------------------------------------------------------------------------------------------------------+
;; DEPRECATED because Labels are deprecated in favor of Collections.

;;; POST /api/card/:id/labels
;; Check that we can update card labels
(tt/expect-with-temp [Card  [{card-id :id}]
                      Label [{label-1-id :id} {:name "Toucan-Friendly"}]
                      Label [{label-2-id :id} {:name "Toucan-Unfriendly"}]]
  [[]                                                                                  ; (1) should start w/ no labels
   [{:id label-1-id, :name "Toucan-Friendly",   :slug "toucan_friendly",   :icon nil}  ; (2) set a few labels
    {:id label-2-id, :name "Toucan-Unfriendly", :slug "toucan_unfriendly", :icon nil}]
   []]                                                                                 ; (3) can reset to no labels?
  (let [get-labels    (fn []
                        (:labels ((user->client :rasta) :get 200, (str "card/" card-id))))
        update-labels (fn [label-ids]
                        ((user->client :rasta) :post 200, (format "card/%d/labels" card-id) {:label_ids label-ids})
                        (get-labels))]
    [(get-labels)                            ; (1)
     (update-labels [label-1-id label-2-id]) ; (2)
     (update-labels [])]))                   ; (3)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            CSV/JSON/XLSX DOWNLOADS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; POST /api/:card-id/query/csv

(defn- do-with-temp-native-card {:style/indent 0} [f]
  (tt/with-temp* [Database  [{database-id :id} {:details (:details (Database (id))), :engine :h2}]
                  Table     [{table-id :id}    {:db_id database-id, :name "CATEGORIES"}]
                  Card      [card              {:dataset_query {:database database-id
                                                                :type     :native
                                                                :native   {:query "SELECT COUNT(*) FROM CATEGORIES;"}}}]]
    ;; delete all permissions for this DB
    (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path database-id))
    (f database-id card)))

;; can someone with native query *read* permissions see a CSV card? (Issue #3648)
(expect
  (str "COUNT(*)\n"
       "75\n")
  (do-with-temp-native-card
    (fn [database-id card]
      ;; insert new permissions for native read access
      (perms/grant-native-read-permissions! (perms-group/all-users) database-id)
      ;; now run the query
      ((user->client :rasta) :post 200 (format "card/%d/query/csv" (u/get-id card))))))

;; does someone without *read* permissions get DENIED?
(expect
  "You don't have permissions to do that."
  (do-with-temp-native-card
    (fn [database-id card]
      ((user->client :rasta) :post 403 (format "card/%d/query/csv" (u/get-id card))))))


;;; Tests for GET /api/card/:id/json
;; endpoint should return an array of maps, one for each row
(expect
  [{(keyword "COUNT(*)") 75}]
  (do-with-temp-native-card
    (fn [database-id card]
      (perms/grant-native-read-permissions! (perms-group/all-users) database-id)
      ((user->client :rasta) :post 200 (format "card/%d/query/json" (u/get-id card))))))

;;; Tests for GET /api/card/:id/xlsx
(expect
  [{:col "COUNT(*)"} {:col 75.0}]
  (do-with-temp-native-card
    (fn [database-id card]
      (perms/grant-native-read-permissions! (perms-group/all-users) database-id)
      (->> ((user->client :rasta) :post 200 (format "card/%d/query/xlsx" (u/get-id card))
            {:request-options {:as :byte-array}})
           ByteArrayInputStream.
           spreadsheet/load-workbook
           (spreadsheet/select-sheet "Query result")
           (spreadsheet/select-columns {:A :col})))))

;;; Test GET /api/card/:id/query/csv & GET /api/card/:id/json & GET /api/card/:id/query/xlsx **WITH PARAMETERS**

(defn- do-with-temp-native-card-with-params {:style/indent 0} [f]
  (tt/with-temp*
    [Database  [{database-id :id} {:details (:details (Database (id))), :engine :h2}]
     Table     [{table-id :id}    {:db_id database-id, :name "VENUES"}]
     Card      [card {:dataset_query
                      {:database database-id
                       :type     :native
                       :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE CATEGORY_ID = {{category}};"
                                  :template_tags {:category {:id           "a9001580-3bcc-b827-ce26-1dbc82429163"
                                                             :name         "category"
                                                             :display_name "Category"
                                                             :type         "number"
                                                             :required     true}}}}}]]
    (f database-id card)))

(def ^:private ^:const ^String encoded-params
  (json/generate-string [{:type   :category
                          :target [:variable [:template-tag :category]]
                          :value  2}]))

;; CSV
(expect
  (str "COUNT(*)\n"
       "8\n")
  (do-with-temp-native-card-with-params
    (fn [database-id card]
      ((user->client :rasta) :post 200 (format "card/%d/query/csv?parameters=%s" (u/get-id card) encoded-params)))))

;; JSON
(expect
  [{(keyword "COUNT(*)") 8}]
  (do-with-temp-native-card-with-params
    (fn [database-id card]
      ((user->client :rasta) :post 200 (format "card/%d/query/json?parameters=%s" (u/get-id card) encoded-params)))))

;; XLSX
(expect
  [{:col "COUNT(*)"} {:col 8.0}]
  (do-with-temp-native-card-with-params
    (fn [database-id card]
      (->> ((user->client :rasta) :post 200 (format "card/%d/query/xlsx?parameters=%s" (u/get-id card) encoded-params)
            {:request-options {:as :byte-array}})
           ByteArrayInputStream.
           spreadsheet/load-workbook
           (spreadsheet/select-sheet "Query result")
           (spreadsheet/select-columns {:A :col})))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  COLLECTIONS                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Make sure we can create a card and specify its `collection_id` at the same time
(tt/expect-with-temp [Collection [collection]]
  (u/get-id collection)
  (with-self-cleaning-random-card-name [card-name]
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (let [{card-id :id} ((user->client :rasta) :post 200 "card"
                         (assoc (card-with-name-and-query card-name (mbql-count-query (data/id) (data/id :venues)))
                           :collection_id (u/get-id collection)))]
      (db/select-one-field :collection_id Card :id card-id))))

;; Make sure we card creation fails if we try to set a `collection_id` we don't have permissions for
(expect
  "You don't have permissions to do that."
  (with-self-cleaning-random-card-name [card-name]
    (tt/with-temp Collection [collection]
      ((user->client :rasta) :post 403 "card"
       (assoc (card-with-name-and-query card-name (mbql-count-query (data/id) (data/id :venues)))
         :collection_id (u/get-id collection))))))

;; Make sure we can change the `collection_id` of a Card if it's not in any collection
(tt/expect-with-temp [Card       [card]
                      Collection [collection]]
  (u/get-id collection)
  (do
    ((user->client :crowberto) :put 200 (str "card/" (u/get-id card)) {:collection_id (u/get-id collection)})
    (db/select-one-field :collection_id Card :id (u/get-id card))))

;; Make sure we can still change *anything* for a Card if we don't have permissions for the Collection it belongs to
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Collection [collection]
                  Card       [card       {:collection_id (u/get-id collection)}]]
    ((user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:name "Number of Blueberries Consumed Per Month"})))

;; Make sure that we can't change the `collection_id` of a Card if we don't have write permissions for the new
;; collection
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Collection [original-collection]
                  Collection [new-collection]
                  Card       [card                {:collection_id (u/get-id original-collection)}]]
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) original-collection)
    ((user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:collection_id (u/get-id new-collection)})))

;; Make sure that we can't change the `collection_id` of a Card if we don't have write permissions for the current
;; collection
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Collection [original-collection]
                  Collection [new-collection]
                  Card       [card                {:collection_id (u/get-id original-collection)}]]
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
    ((user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:collection_id (u/get-id new-collection)})))

;; But if we do have permissions for both, we should be able to change it.
(tt/expect-with-temp [Collection [original-collection]
                      Collection [new-collection]
                      Card       [card                {:collection_id (u/get-id original-collection)}]]
  (u/get-id new-collection)
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) original-collection)
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
    ((user->client :rasta) :put 200 (str "card/" (u/get-id card)) {:collection_id (u/get-id new-collection)})
    (db/select-one-field :collection_id Card :id (u/get-id card))))


;;; Test GET /api/card?collection= -- Test that we can use empty string to return Cards not in any collection
(tt/expect-with-temp [Collection [collection]
                      Card       [card-1     {:collection_id (u/get-id collection)}]
                      Card       [card-2]]
  [(u/get-id card-2)]
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (map :id ((user->client :rasta) :get 200 "card/" :collection ""))))

;; Test GET /api/card?collection=<slug> filters by collection with slug
(tt/expect-with-temp [Collection [collection {:name "Favorite Places"}]
                      Card       [card-1     {:collection_id (u/get-id collection)}]
                      Card       [card-2]]
  [(u/get-id card-1)]
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (map :id ((user->client :rasta) :get 200 "card/" :collection :favorite_places))))

;; Test GET /api/card?collection=<slug> should return a 404 if no such collection exists
(expect
  "Not found."
  ((user->client :rasta) :get 404 "card/" :collection :some_fake_collection_slug))

;; Make sure GET /api/card?collection=<slug> still works with Collections with URL-encoded Slugs (#4535)
(expect
  []
  (tt/with-temp Collection [collection {:name "Obsługa klienta"}]
    (do
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :get 200 "card/" :collection "obs%C5%82uga_klienta"))))

;; ...even if the slug isn't passed in URL-encoded
(expect
  []
  (tt/with-temp Collection [collection {:name "Obsługa klienta"}]
    (do
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :get 200 "card/" :collection "obsługa_klienta"))))


;;; ------------------------------ Bulk Collections Update (POST /api/card/collections) ------------------------------

(defn- collection-ids [cards-or-card-ids]
  (map :collection_id (db/select [Card :collection_id]
                        :id [:in (map u/get-id cards-or-card-ids)])))

(defn- POST-card-collections!
  "Update the Collection of CARDS-OR-CARD-IDS via the `POST /api/card/collections` endpoint using USERNAME;
   return the response of this API request and the latest Collection IDs from the database."
  [username expected-status-code collection-or-collection-id-or-nil cards-or-card-ids]
  [((user->client username) :post expected-status-code "card/collections"
     {:collection_id (when collection-or-collection-id-or-nil
                       (u/get-id collection-or-collection-id-or-nil))
      :card_ids      (map u/get-id cards-or-card-ids)})
   (collection-ids cards-or-card-ids)])

;; Test that we can bulk move some Cards with no collection into a collection
(tt/expect-with-temp [Collection [collection]
                      Card       [card-1]
                      Card       [card-2]]
  [{:status "ok"}
   [(u/get-id collection) (u/get-id collection)]]
  (POST-card-collections! :crowberto 200 collection [card-1 card-2]))

;; Test that we can bulk move some Cards from one collection to another
(tt/expect-with-temp [Collection [old-collection]
                      Collection [new-collection]
                      Card       [card-1         {:collection_id (u/get-id old-collection)}]
                      Card       [card-2         {:collection_id (u/get-id old-collection)}]]
  [{:status "ok"}
   [(u/get-id new-collection) (u/get-id new-collection)]]
  (POST-card-collections! :crowberto 200 new-collection [card-1 card-2]))

;; Test that we can bulk remove some Cards from a collection
(expect
  [{:status "ok"}
   [nil nil]]
  (tt/with-temp* [Collection [collection]
                  Card       [card-1     {:collection_id (u/get-id collection)}]
                  Card       [card-2     {:collection_id (u/get-id collection)}]]
    (POST-card-collections! :crowberto 200 nil [card-1 card-2])))

;; Check that we aren't allowed to move Cards if we don't have permissions for destination collection
(expect
  ["You don't have permissions to do that."
   [nil nil]]
  (tt/with-temp* [Collection [collection]
                  Card       [card-1]
                  Card       [card-2]]
    (POST-card-collections! :rasta 403 collection [card-1 card-2])))

;; Check that we aren't allowed to move Cards if we don't have permissions for source collection
(tt/expect-with-temp [Collection [collection]
                      Card       [card-1     {:collection_id (u/get-id collection)}]
                      Card       [card-2     {:collection_id (u/get-id collection)}]]
  ["You don't have permissions to do that."
   [(u/get-id collection) (u/get-id collection)]]
  (POST-card-collections! :rasta 403 nil [card-1 card-2]))

;; Check that we aren't allowed to move Cards if we don't have permissions for the Card
(expect
  ["You don't have permissions to do that."
   [nil nil]]
  (tt/with-temp* [Collection [collection]
                  Database   [database]
                  Table      [table      {:db_id (u/get-id database)}]
                  Card       [card-1     {:dataset_query (mbql-count-query (u/get-id database) (u/get-id table))}]
                  Card       [card-2     {:dataset_query (mbql-count-query (u/get-id database) (u/get-id table))}]]
    (perms/revoke-permissions! (perms-group/all-users) (u/get-id database))
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (POST-card-collections! :rasta 403 collection [card-1 card-2])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- shared-card []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (user->id :crowberto)})

;;; ----------------------------------------- POST /api/card/:id/public_link -----------------------------------------

;; Test that we can share a Card
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card]
      (let [{uuid :uuid} ((user->client :crowberto) :post 200 (format "card/%d/public_link" (u/get-id card)))]
        (db/exists? Card :id (u/get-id card), :public_uuid uuid)))))

;; Test that we *cannot* share a Card if we aren't admins
(expect
  "You don't have permissions to do that."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card]
      ((user->client :rasta) :post 403 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we *cannot* share a Card if the setting is disabled
(expect
  "Public sharing is not enabled."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (tt/with-temp Card [card]
      ((user->client :crowberto) :post 400 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we *cannot* share a Card if the Card has been archived
(expect
  {:message "The object has been archived.", :error_code "archived"}
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card {:archived true}]
      ((user->client :crowberto) :post 404 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we get a 404 if the Card doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    ((user->client :crowberto) :post 404 (format "card/%d/public_link" Integer/MAX_VALUE))))

;; Test that if a Card has already been shared we reüse the existing UUID
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      (= (:public_uuid card)
         (:uuid ((user->client :crowberto) :post 200 (format "card/%d/public_link" (u/get-id card))))))))


;;; ---------------------------------------- DELETE /api/card/:id/public_link ----------------------------------------

;; Test that we can unshare a Card
(expect
  false
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      ((user->client :crowberto) :delete 204 (format "card/%d/public_link" (u/get-id card)))
      (db/exists? Card :id (u/get-id card), :public_uuid (:public_uuid card)))))

;; Test that we *cannot* unshare a Card if we are not admins
(expect
  "You don't have permissions to do that."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      ((user->client :rasta) :delete 403 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we get a 404 if Card isn't shared
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card]
      ((user->client :crowberto) :delete 404 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we get a 404 if Card doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    ((user->client :crowberto) :delete 404 (format "card/%d/public_link" Integer/MAX_VALUE))))

;; Test that we can fetch a list of publicly-accessible cards
(expect
  [{:name true, :id true, :public_uuid true}]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      (for [card ((user->client :crowberto) :get 200 "card/public")]
        (m/map-vals boolean (select-keys card [:name :id :public_uuid]))))))

;; Test that we can fetch a list of embeddable cards
(expect
  [{:name true, :id true}]
  (tu/with-temporary-setting-values [enable-embedding true]
    (tt/with-temp Card [card {:enable_embedding true}]
      (for [card ((user->client :crowberto) :get 200 "card/embeddable")]
        (m/map-vals boolean (select-keys card [:name :id]))))))

;; Test related/recommended entities
(expect
  #{:table :metrics :segments :dashboard-mates :similar-questions :canonical-metric :dashboards :collections}
  (tt/with-temp* [Card [{card-id :id}]]
    (-> ((user->client :crowberto) :get 200 (format "card/%s/related" card-id)) keys set)))
