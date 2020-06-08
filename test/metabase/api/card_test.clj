(ns metabase.api.card-test
  "Tests for /api/card endpoints."
  (:require [cheshire.core :as json]
            [clojure
             [string :as str]
             [test :refer :all]]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [medley.core :as m]
            [metabase
             [email-test :as et]
             [http-client :as http :refer :all]
             [models :refer [Card CardFavorite Collection Dashboard Database Pulse PulseCard PulseChannel PulseChannelRecipient Table ViewLog]]
             [test :as mt]
             [util :as u]]
            [metabase.api.card :as card-api]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as perms-group]]
            [metabase.query-processor.async :as qp.async]
            [metabase.query-processor.middleware
             [constraints :as constraints]
             [results-metadata :as results-metadata]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.io.ByteArrayInputStream
           java.util.UUID))

(comment card-api/keep-me)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- count-base-type []
  (-> (mt/run-mbql-query venues {:aggregation [[:count]]}) :data :cols first :base_type u/qualified-name))

(def card-defaults
  {:archived            false
   :collection_id       nil
   :collection_position nil
   :dataset_query       {}
   :description         nil
   :display             "scalar"
   :enable_embedding    false
   :embedding_params    nil
   :made_public_by_id   nil
   :public_uuid         nil
   :query_type          nil
   :cache_ttl           nil
   :result_metadata     nil})

(defn- mbql-count-query
  ([]
   (mbql-count-query (data/id) (data/id :venues)))

  ([db-or-id table-or-id]
   {:database (u/get-id db-or-id)
    :type     :query
    :query    {:source-table (u/get-id table-or-id), :aggregation [[:count]]}}))

(defn- card-with-name-and-query
  ([]
   (card-with-name-and-query (tu/random-name)))
  ([card-name]
   (card-with-name-and-query card-name (mbql-count-query)))
  ([card-name query]
   {:name                   card-name
    :display                "scalar"
    :dataset_query          query
    :visualization_settings {:global {:title nil}}}))

(defn- do-with-temp-native-card
  {:style/indent 0}
  [f]
  (tt/with-temp* [Database   [db    {:details (:details (data/db)), :engine :h2}]
                  Table      [table {:db_id (u/get-id db), :name "CATEGORIES"}]
                  Card       [card  {:dataset_query {:database (u/get-id db)
                                                     :type     :native
                                                     :native   {:query "SELECT COUNT(*) FROM CATEGORIES;"}}}]]
    (f db card)))

(defmacro ^:private with-temp-native-card
  {:style/indent 1}
  [[db-binding card-binding] & body]
  `(do-with-temp-native-card (fn [~(or db-binding '_) ~(or card-binding '_)]
                               ~@body)))


(defn do-with-cards-in-a-collection [card-or-cards-or-ids grant-perms-fn! f]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      ;; put all the Card(s) in our temp `collection`
      (doseq [card-or-id (if (sequential? card-or-cards-or-ids)
                           card-or-cards-or-ids
                           [card-or-cards-or-ids])]
        (db/update! Card (u/get-id card-or-id) {:collection_id (u/get-id collection)}))
      ;; now use `grant-perms-fn!` to grant appropriate perms
      (grant-perms-fn! (perms-group/all-users) collection)
      ;; call (f)
      (f))))

(defmacro with-cards-in-readable-collection
  "Execute `body` with `card-or-cards-or-ids` added to a temporary Collection that All Users have read permissions for."
  {:style/indent 1}
  [card-or-cards-or-ids & body]
  `(do-with-cards-in-a-collection ~card-or-cards-or-ids perms/grant-collection-read-permissions! (fn [] ~@body)))

(defmacro with-cards-in-writeable-collection
  "Execute `body` with `card-or-cards-or-ids` added to a temporary Collection that All Users have *write* permissions
  for."
  {:style/indent 1}
  [card-or-cards-or-ids & body]
  `(do-with-cards-in-a-collection ~card-or-cards-or-ids perms/grant-collection-readwrite-permissions! (fn [] ~@body)))


(defn- do-with-temp-native-card-with-params {:style/indent 0} [f]
  (tt/with-temp*
    [Database   [db    {:details (:details (data/db)), :engine :h2}]
     Table      [table {:db_id (u/get-id db), :name "VENUES"}]
     Card       [card  {:dataset_query
                        {:database (u/get-id db)
                         :type     :native
                         :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE CATEGORY_ID = {{category}};"
                                    :template-tags {:category {:id           "a9001580-3bcc-b827-ce26-1dbc82429163"
                                                               :name         "category"
                                                               :display_name "Category"
                                                               :type         "number"
                                                               :required     true}}}}}]]
    (f db card)))

(defmacro ^:private with-temp-native-card-with-params {:style/indent 1} [[db-binding card-binding] & body]
  `(do-with-temp-native-card-with-params (fn [~(or db-binding '_) ~(or card-binding '_)] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           FETCHING CARDS & FILTERING                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- card-returned? [model object-or-id card-or-id]
  (contains? (set (for [card ((mt/user->client :rasta) :get 200 "card", :f model, :model_id (u/get-id object-or-id))]
                    (u/get-id card)))
             (u/get-id card-or-id)))

(deftest filter-cards-by-db-test
  (tt/with-temp* [Database [db]
                  Card     [card-1 {:database_id (data/id)}]
                  Card     [card-2 {:database_id (u/get-id db)}]]
    (with-cards-in-readable-collection [card-1 card-2]
      (is (= true
             (card-returned? :database (data/id) card-1)))
      (is (= false
             (card-returned? :database db        card-1)))
      (is (= true
             (card-returned? :database db        card-2))))))


(deftest authentication-test
  (is (= (get middleware.u/response-unauthentic :body) (http/client :get 401 "card")))
  (is (= (get middleware.u/response-unauthentic :body) (http/client :put 401 "card/13"))))

(deftest model-id-requied-when-f-is-database-test
  (is (= {:errors {:model_id "model_id is a required parameter when filter mode is 'database'"}}
         ((mt/user->client :crowberto) :get 400 "card" :f :database))))

(deftest filter-cards-by-table-test
  (testing "Filter cards by table"
    (tt/with-temp* [Database [db]
                    Table    [table-1  {:db_id (u/get-id db)}]
                    Table    [table-2  {:db_id (u/get-id db)}]
                    Card     [card-1   {:table_id (u/get-id table-1)}]
                    Card     [card-2   {:table_id (u/get-id table-2)}]]
      (with-cards-in-readable-collection [card-1 card-2]
        (is (= true
               (card-returned? :table (u/get-id table-1) (u/get-id card-1))))
        (is (= false
               (card-returned? :table (u/get-id table-2) (u/get-id card-1))))
        (is (= true
               (card-returned? :table (u/get-id table-2) (u/get-id card-2))))))))

;; Make sure `model_id` is required when `f` is :table
(deftest model_id-requied-when-f-is-table
  (is (= {:errors {:model_id "model_id is a required parameter when filter mode is 'table'"}}
         ((mt/user->client :crowberto) :get 400 "card", :f :table))))

(deftest filter-by-recent-test
  (testing "Filter by `recent`"
    (tt/with-temp* [Card    [card-1 {:name "Card 1"}]
                    Card    [card-2 {:name "Card 2"}]
                    Card    [card-3 {:name "Card 3"}]
                    Card    [card-4 {:name "Card 4"}]
                    ;; 3 was viewed most recently, followed by 4, then 1. Card 2 was viewed by a different user so
                    ;; shouldn't be returned
                    ViewLog [_ {:model     "card", :model_id (u/get-id card-1), :user_id (mt/user->id :rasta)
                                :timestamp #t "2015-12-01"}]
                    ViewLog [_ {:model     "card", :model_id (u/get-id card-2), :user_id (mt/user->id :trashbird)
                                :timestamp #t "2016-01-01"}]
                    ViewLog [_ {:model     "card", :model_id (u/get-id card-3), :user_id (mt/user->id :rasta)
                                :timestamp #t "2016-02-01"}]
                    ViewLog [_ {:model     "card", :model_id (u/get-id card-4), :user_id (mt/user->id :rasta)
                                :timestamp #t "2016-03-01"}]
                    ViewLog [_ {:model     "card", :model_id (u/get-id card-3), :user_id (mt/user->id :rasta)
                                :timestamp #t "2016-04-01"}]]
      (with-cards-in-readable-collection [card-1 card-2 card-3 card-4]
        (is (= ["Card 3"
                "Card 4"
                "Card 1"]
               (map :name ((mt/user->client :rasta) :get 200 "card", :f :recent)))
            "Should return cards that were recently viewed by current user only")))))

(deftest filter-by-popular-test
  (testing "Filter by `popular`"
    (tt/with-temp* [Card     [card-1 {:name "Card 1"}]
                    Card     [card-2 {:name "Card 2"}]
                    Card     [card-3 {:name "Card 3"}]
                    ;; 3 entries for card 3, 2 for card 2, none for card 1,
                    ViewLog  [_ {:model "card", :model_id (u/get-id card-3), :user_id (mt/user->id :rasta)}]
                    ViewLog  [_ {:model "card", :model_id (u/get-id card-2), :user_id (mt/user->id :trashbird)}]
                    ViewLog  [_ {:model "card", :model_id (u/get-id card-2), :user_id (mt/user->id :rasta)}]
                    ViewLog  [_ {:model "card", :model_id (u/get-id card-3), :user_id (mt/user->id :crowberto)}]
                    ViewLog  [_ {:model "card", :model_id (u/get-id card-3), :user_id (mt/user->id :rasta)}]]
      (with-cards-in-readable-collection [card-1 card-2 card-3]
        (is (= ["Card 3"
                "Card 2"]
               (map :name ((mt/user->client :rasta) :get 200 "card", :f :popular)))
            (str "`f=popular` should return cards sorted by number of ViewLog entries for all users; cards with no "
                 "entries should be excluded"))))))

(deftest filter-by-archived-test
  (testing "Filter by `archived`"
    (tt/with-temp* [Card [card-1 {:name "Card 1"}]
                    Card [card-2 {:name "Card 2", :archived true}]
                    Card [card-3 {:name "Card 3", :archived true}]]
      (with-cards-in-readable-collection [card-1 card-2 card-3]
        (is (= #{"Card 2" "Card 3"}
               (set (map :name ((mt/user->client :rasta) :get 200 "card", :f :archived))))
            "The set of Card returned with f=archived should be equal to the set of archived cards")))))

(deftest filter-by-fav-test
  (testing "Filter by `fav`"
    (tt/with-temp* [Card         [card-1 {:name "Card 1"}]
                    Card         [card-2 {:name "Card 2"}]
                    Card         [card-3 {:name "Card 3"}]
                    CardFavorite [_ {:card_id (u/get-id card-1), :owner_id (mt/user->id :rasta)}]
                    CardFavorite [_ {:card_id (u/get-id card-2), :owner_id (mt/user->id :crowberto)}]]
      (with-cards-in-readable-collection [card-1 card-2 card-3]
        (is (= [{:name "Card 1", :favorite true}]
               (for [card ((mt/user->client :rasta) :get 200 "card", :f :fav)]
                 (select-keys card [:name :favorite]))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        CREATING A CARD (POST /api/card)                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Test that we can make a card
(deftest create-a-card
  (let [card-name (tu/random-name)]
    (tu/with-non-admin-groups-no-root-collection-perms
      (tt/with-temp* [Collection [collection]]
        (tu/with-model-cleanup [Card]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (is (= (merge
                  card-defaults
                  {:name                   card-name
                   :collection_id          true
                   :collection             true
                   :creator_id             (mt/user->id :rasta)
                   :dataset_query          true
                   :query_type             "query"
                   :visualization_settings {:global {:title nil}}
                   :database_id            true
                   :table_id               true
                   :can_write              true
                   :dashboard_count        0
                   :result_metadata        true
                   :creator                (merge
                                            (select-keys (mt/fetch-user :rasta) [:id :date_joined :last_login :locale])
                                            {:common_name  "Rasta Toucan"
                                             :is_superuser false
                                             :last_name    "Toucan"
                                             :first_name   "Rasta"
                                             :email        "rasta@metabase.com"})})
                 (-> ((mt/user->client :rasta) :post 202 "card"
                      (assoc (card-with-name-and-query card-name (mbql-count-query (data/id) (data/id :venues)))
                             :collection_id (u/get-id collection)))
                     (dissoc :created_at :updated_at :id)
                     (update :table_id integer?)
                     (update :database_id integer?)
                     (update :collection_id integer?)
                     (update :dataset_query map?)
                     (update :collection map?)
                     (update :result_metadata (partial every? map?))
                     (update :creator dissoc :is_qbnewb)))))))))

;; Make sure when saving a Card the query metadata is saved (if correct)
(deftest saving-card-saves-query-metadata
  (tu/with-non-admin-groups-no-root-collection-perms
    (let [metadata  [{:base_type    :type/Integer
                      :display_name "Count Chocula"
                      :name         "count_chocula"
                      :special_type :type/Number}]
          card-name (tu/random-name)]
      (tt/with-temp Collection [collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (tu/with-model-cleanup [Card]
          ;; create a card with the metadata
          ((mt/user->client :rasta) :post 202 "card"
           (assoc (card-with-name-and-query card-name)
                  :collection_id      (u/get-id collection)
                  :result_metadata    metadata
                  :metadata_checksum  (#'results-metadata/metadata-checksum metadata)))
          ;; now check the metadata that was saved in the DB
          (is (= [{:base_type    "type/Integer"
                   :display_name "Count Chocula"
                   :name         "count_chocula"
                   :special_type "type/Number"}]
                 (db/select-one-field :result_metadata Card :name card-name))))))))

;; we should be able to save a Card if the `result_metadata` is *empty* (but not nil) (#9286)
(deftest save-card-with-empty-result-metadata
  (is (tu/with-model-cleanup [Card]
        ;; create a card with the metadata
        ((mt/user->client :rasta) :post 202 "card"
         (assoc (card-with-name-and-query)
                :result_metadata    []
                :metadata_checksum  (#'results-metadata/metadata-checksum []))))))


(defn- fingerprint-integers->doubles
  "Converts the min/max fingerprint values to doubles so simulate how the FE will change the metadata when POSTing a
  new card"
  [metadata]
  (update metadata :fingerprint (fn [fingerprint] (-> fingerprint
                                                      (update-in [:type :type/Number :min] double)
                                                      (update-in [:type :type/Number :max] double)))))

;; When integer values are passed to the FE, they will be returned as floating point values. Our hashing should ensure
;; that integer and floating point values hash the same so we don't needlessly rerun the query
(deftest ints-returned-as-floating-point
  (is (= [{:base_type    "type/Integer"
           :display_name "Count Chocula"
           :name         "count_chocula"
           :special_type "type/Number"
           :fingerprint  {:global {:distinct-count 285},
                          :type {:type/Number {:min 5.0, :max 2384.0, :avg 1000.2}}}}]
         (tu/with-non-admin-groups-no-root-collection-perms
           (let [metadata  [{:base_type    :type/Integer
                             :display_name "Count Chocula"
                             :name         "count_chocula"
                             :special_type :type/Number
                             :fingerprint  {:global {:distinct-count 285},
                                            :type {:type/Number {:min 5, :max 2384, :avg 1000.2}}}}]
                 card-name (tu/random-name)]
             (tt/with-temp Collection [collection]
               (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
               (tu/throw-if-called qp.async/result-metadata-for-query-async
                                   (tu/with-model-cleanup [Card]
                                     ;; create a card with the metadata
                                     ((mt/user->client :rasta) :post 202 "card"
                                      (assoc (card-with-name-and-query card-name)
                                             :collection_id      (u/get-id collection)
                                             :result_metadata    (map fingerprint-integers->doubles metadata)
                                             :metadata_checksum  (#'results-metadata/metadata-checksum metadata)))
                                     ;; now check the metadata that was saved in the DB
                                     (db/select-one-field :result_metadata Card :name card-name)))))))))

;; make sure when saving a Card the correct query metadata is fetched (if incorrect)
(deftest saving-card-fetches-correct-metadata
  (is (= [{:base_type    "type/BigInteger"
           :display_name "Count"
           :name         "count"
           :special_type "type/Quantity"
           :fingerprint  {:global {:distinct-count 1
                                   :nil%           0.0},
                          :type   {:type/Number {:min 100.0, :max 100.0, :avg 100.0, :q1 100.0, :q3 100.0 :sd nil}}}}]
         (tu/with-non-admin-groups-no-root-collection-perms
           (let [metadata  [{:base_type    :type/BigInteger
                             :display_name "Count Chocula"
                             :name         "count_chocula"
                             :special_type :type/Quantity}]
                 card-name (tu/random-name)]
             (tt/with-temp Collection [collection]
               (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
               (tu/with-model-cleanup [Card]
                 ;; create a card with the metadata
                 ((mt/user->client :rasta) :post 202 "card"
                  (assoc (card-with-name-and-query card-name)
                         :collection_id      (u/get-id collection)
                         :result_metadata    metadata
                         :metadata_checksum  "ABCDEF")) ; bad checksum
                 ;; now check the correct metadata was fetched and was saved in the DB
                 (db/select-one-field :result_metadata Card :name card-name))))))))

(deftest fetch-results-metadata-test
  (testing "Check that the generated query to fetch the query result metadata includes user information in the generated query"
    (tu/with-non-admin-groups-no-root-collection-perms
      (let [metadata  [{:base_type    :type/Integer
                        :display_name "Count Chocula"
                        :name         "count_chocula"
                        :special_type :type/Quantity}]
            card-name (tu/random-name)]
        (tt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (tu/with-model-cleanup [Card]
            ;; TODO - FIXME - wrong impl
            ;; Rebind the `prepared-statement` function so that we can capture the generated SQL and inspect it
            (let [orig       (var-get #'sql-jdbc.execute/prepared-statement)
                  sql-result (atom nil)]
              (with-redefs [sql-jdbc.execute/prepared-statement
                            (fn [driver conn sql params]
                              (reset! sql-result sql)
                              (orig driver conn sql params))]
                ;; create a card with the metadata
                ((mt/user->client :rasta) :post 202 "card"
                 (assoc (card-with-name-and-query card-name)
                        :collection_id      (u/get-id collection)
                        :result_metadata    metadata
                        :metadata_checksum  "ABCDEF"))) ; bad checksum
              (testing "check the correct metadata was fetched and was saved in the DB"
                (is (= [{:base_type    (count-base-type)
                         :display_name "Count"
                         :name         "count"
                         :special_type "type/Quantity"
                         :fingerprint  {:global {:distinct-count 1
                                                 :nil%           0.0},
                                        :type   {:type/Number {:min 100.0, :max 100.0, :avg 100.0, :q1 100.0, :q3 100.0 :sd nil}}}}]
                       (db/select-one-field :result_metadata Card :name card-name))))
              (testing "Was the user id found in the generated SQL?"
                (is (= true
                       (boolean
                        (when-let [s @sql-result]
                          (re-find (re-pattern (str "userID: " (mt/user->id :rasta)))
                                   s)))))))))))))

;; Make sure we can create a Card with a Collection position
(deftest create-card-with-collection-position
  (is (= #metabase.models.card.CardInstance{:collection_id true, :collection_position 1}
         (tu/with-non-admin-groups-no-root-collection-perms
           (tu/with-model-cleanup [Card]
             (let [card-name (tu/random-name)]
               (tt/with-temp Collection [collection]
                 (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
                 ((mt/user->client :rasta) :post 202 "card" (assoc (card-with-name-and-query card-name)
                                                                           :collection_id (u/get-id collection), :collection_position 1))
                 (some-> (db/select-one [Card :collection_id :collection_position] :name card-name)
                         (update :collection_id (partial = (u/get-id collection)))))))))))

;; ...but not if we don't have permissions for the Collection
(deftest need-permission-for-collection
  (is (nil? (tu/with-non-admin-groups-no-root-collection-perms
              (tu/with-model-cleanup [Card]
                (let [card-name (tu/random-name)]
                  (tt/with-temp Collection [collection]
                    ((mt/user->client :rasta) :post 403 "card" (assoc (card-with-name-and-query card-name)
                                                                              :collection_id (u/get-id collection)
                                                                              :collection_position 1))
                    (some-> (db/select-one [Card :collection_id :collection_position] :name card-name)
                            (update :collection_id (partial = (u/get-id collection)))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            FETCHING A SPECIFIC CARD                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest basic-fetch-test
  (testing "Test that we can fetch a card"
    (mt/with-temp* [Database   [db          (select-keys (data/db) [:engine :details])]
                    Table      [table       (-> (Table (data/id :venues))
                                                (dissoc :id)
                                                (assoc :db_id (u/get-id db)))]
                    Collection [collection]
                    Card       [card        {:collection_id (u/get-id collection)
                                             :dataset_query (mbql-count-query (u/get-id db) (u/get-id table))}]]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (is (= (merge
              card-defaults
              (select-keys card [:id :name :created_at :updated_at])
              {:dashboard_count        0
               :creator_id             (mt/user->id :rasta)
               :creator                (merge
                                        (select-keys (mt/fetch-user :rasta) [:id :date_joined :last_login])
                                        {:common_name  "Rasta Toucan"
                                         :is_superuser false
                                         :is_qbnewb    true
                                         :last_name    "Toucan"
                                         :first_name   "Rasta"
                                         :email        "rasta@metabase.com"})
               :dataset_query          (tu/obj->json->obj (:dataset_query card))
               :display                "table"
               :query_type             "query"
               :visualization_settings {}
               :can_write              true
               :database_id            (u/get-id db) ; these should be inferred from the dataset_query
               :table_id               (u/get-id table)
               :collection_id          (u/get-id collection)
               :collection             (into {} collection)})
             ((mt/user->client :rasta) :get 200 (str "card/" (u/get-id card))))))))

(deftest check-that-a-user-without-permissions-isn-t-allowed-to-fetch-the-card
  (is (= "You don't have permissions to do that."
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Database [db]
                           Table    [table {:db_id (u/get-id db)}]
                           Card     [card  {:dataset_query (mbql-count-query (u/get-id db) (u/get-id table))}]]
             ;; revoke permissions for default group to this database
             (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
             ;; now a non-admin user shouldn't be able to fetch this card
             ((mt/user->client :rasta) :get 403 (str "card/" (u/get-id card))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                UPDATING A CARD                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+


(deftest updating-a-card-that-doesnt-exist-should-give-a-404
  (is (= "Not found."
         ((mt/user->client :crowberto) :put 404 "card/12345"))))


(deftest test-that-we-can-edit-a-card
  (tt/with-temp Card [card {:name "Original Name"}]
    (with-cards-in-writeable-collection card
      (is (= "Original Name"
             (db/select-one-field :name Card, :id (u/get-id card))))
      ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:name "Updated Name"})
      (is (= "Updated Name"
             (db/select-one-field :name Card, :id (u/get-id card)))))))

(deftest can-we-update-a-card-s-archived-status-
  (tt/with-temp Card [card]
    (with-cards-in-writeable-collection card
      (let [archived?     (fn [] (:archived (Card (u/get-id card))))
            set-archived! (fn [archived]
                            ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:archived archived})
                            (archived?))]
        (is (= false
               (archived?)))
        (is (= true
               (set-archived! true)))
        (is (= false
               (set-archived! false)))))))

(deftest we-shouldn-t-be-able-to-update-archived-status-if-we-don-t-have-collection--write--perms
  (is (= "You don't have permissions to do that."
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [collection]
                           Card       [card {:collection_id (u/get-id collection)}]]
             (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
             ((mt/user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:archived true}))))))

;; Can we clear the description of a Card? (#4738)
(deftest can-we-clear-the-description-of-a-card----4738-
  (is (nil? (tt/with-temp Card [card {:description "What a nice Card"}]
              (with-cards-in-writeable-collection card
                ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:description nil})
                (db/select-one-field :description Card :id (u/get-id card)))))))

(deftest description-should-be-blankable-as-well
  (is (= ""
         (tt/with-temp Card [card {:description "What a nice Card"}]
           (with-cards-in-writeable-collection card
             ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:description ""})
             (db/select-one-field :description Card :id (u/get-id card)))))))

(deftest can-we-update-a-card-s-embedding-params-
  (is (= {:abc "enabled"}
         (tt/with-temp Card [card]
           (tu/with-temporary-setting-values [enable-embedding true]
             ((mt/user->client :crowberto) :put 202 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))
           (db/select-one-field :embedding_params Card :id (u/get-id card))))))

(deftest we-shouldn-t-be-able-to-update-them-if-we-re-not-an-admin---
  (is (= "You don't have permissions to do that."
         (tt/with-temp Card [card]
           (tu/with-temporary-setting-values [enable-embedding true]
             ((mt/user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))))))

(deftest ---or-if-embedding-isn-t-enabled
  (is (= "Embedding is not enabled."
         (tt/with-temp Card [card]
           (tu/with-temporary-setting-values [enable-embedding false]
             ((mt/user->client :crowberto) :put 400 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))))))

(deftest make-sure-when-updating-a-card-the-query-metadata-is-saved--if-correct-
  (let [metadata [{:base_type    :type/Integer
                   :display_name "Count Chocula"
                   :name         "count_chocula"
                   :special_type :type/Number}]]
    (tt/with-temp Card [card]
      (with-cards-in-writeable-collection card
        ;; update the Card's query
        ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card))
         {:dataset_query     (mbql-count-query)
          :result_metadata   metadata
          :metadata_checksum (#'results-metadata/metadata-checksum metadata)})
        ;; now check the metadata that was saved in the DB
        (is (= [{:base_type    "type/Integer"
                 :display_name "Count Chocula"
                 :name         "count_chocula"
                 :special_type "type/Number"}]
               (db/select-one-field :result_metadata Card :id (u/get-id card))))))))

(deftest make-sure-when-updating-a-card-the-correct-query-metadata-is-fetched--if-incorrect-
  (let [metadata [{:base_type    :type/BigInteger
                   :display_name "Count Chocula"
                   :name         "count_chocula"
                   :special_type :type/Quantity}]]
    (tt/with-temp Card [card]
      (with-cards-in-writeable-collection card
        ;; update the Card's query
        ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card))
         {:dataset_query     (mbql-count-query)
          :result_metadata   metadata
          :metadata_checksum "ABC123"}) ; invalid checksum
        ;; now check the metadata that was saved in the DB
        (is (= [{:base_type    "type/BigInteger"
                 :display_name "Count"
                 :name         "count"
                 :special_type "type/Quantity"
                 :fingerprint  {:global {:distinct-count 1
                                         :nil%           0.0},
                                :type   {:type/Number {:min 100.0, :max 100.0, :avg 100.0, :q1 100.0, :q3 100.0 :sd nil}}}}]
               (db/select-one-field :result_metadata Card :id (u/get-id card))))))))

(deftest can-we-change-the-collection-position-of-a-card-
  (tt/with-temp Card [card]
    (with-cards-in-writeable-collection card
      ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card))
       {:collection_position 1})
      (is (= 1
             (db/select-one-field :collection_position Card :id (u/get-id card)))))))

(deftest ---and-unset--unpin--it-as-well-
  (tt/with-temp Card [card {:collection_position 1}]
    (with-cards-in-writeable-collection card
      ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card))
       {:collection_position nil})
      (is (= nil
             (db/select-one-field :collection_position Card :id (u/get-id card)))))))

(deftest ---we-shouldn-t-be-able-to-if-we-don-t-have-permissions-for-the-collection
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection]
                    Card       [card {:collection_id (u/get-id collection)}]]
      ((mt/user->client :rasta) :put 403 (str "card/" (u/get-id card))
       {:collection_position 1})
      (is (= nil
             (db/select-one-field :collection_position Card :id (u/get-id card)))))))

(deftest gets-a-card
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection]
                    Card       [card {:collection_id (u/get-id collection), :collection_position 1}]]
      ((mt/user->client :rasta) :put 403 (str "card/" (u/get-id card))
       {:collection_position nil})
      (is (= 1
             (db/select-one-field :collection_position Card :id (u/get-id card)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Updating the positions of stuff                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- name->position [results]
  (zipmap (map :name results)
          (map :collection_position results)))

(defn get-name->collection-position
  "Call the collection endpoint for `collection-id` as `user-kwd`. Will return a map with the names of the items as
  keys and their position as the value"
  [user-kwd collection-or-collection-id]
  (name->position ((mt/user->client user-kwd) :get 200 (format "collection/%s/items" (u/get-id collection-or-collection-id)))))

(defmacro with-ordered-items
  "Macro for creating many sequetial collection_position model instances, putting each in `collection`"
  [collection model-and-name-syms & body]
  `(tt/with-temp* ~(vec (mapcat (fn [idx [model-instance name-sym]]
                                  [model-instance [name-sym {:name                (name name-sym)
                                                             :collection_id       `(u/get-id ~collection)
                                                             :collection_position idx}]])
                                (iterate inc 1)
                                (partition-all 2 model-and-name-syms)))
     (testing (format "\nWith ordered items in Collection %d: %s"
                      (u/get-id ~collection)
                      ~(str/join ", " (for [[model symb] (partition-all 2 model-and-name-syms)]
                                        (format "%s %s" (name model) (name symb)))))
       ~@body)))

(deftest check-to-make-sure-we-can-move-a-card-in-a-collection-of-just-cards
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (with-ordered-items collection [Card a
                                      Card b
                                      Card c
                                      Card d]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id c))
         {:collection_position 1})
        (is (= {"c" 1
                "a" 2
                "b" 3
                "d" 4}
               (get-name->collection-position :rasta collection)))))))

(deftest change-the-position-of-the-4th-card-to-1st--all-other-cards-should-inc-their-position
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (with-ordered-items collection [Dashboard a
                                      Dashboard b
                                      Pulse     c
                                      Card      d]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id d))
         {:collection_position 1})
        (is (= {"d" 1
                "a" 2
                "b" 3
                "c" 4}
               (get-name->collection-position :rasta collection)))))))

(deftest change-the-position-of-the-1st-card-to-the-4th--all-of-the-other-items-dec
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (with-ordered-items collection [Card      a
                                      Dashboard b
                                      Pulse     c
                                      Dashboard d]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id a))
         {:collection_position 4})
        (is (= {"b" 1
                "c" 2
                "d" 3
                "a" 4}
               (get-name->collection-position :rasta collection)))))))

(deftest change-the-position-of-a-card-from-nil-to-2nd--should-adjust-the-existing-items
  (is (= {"a" 1
          "b" 2
          "c" 3
          "d" 4}
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [{coll-id :id :as collection}]
                           Card       [_ {:name "a", :collection_id coll-id, :collection_position 1}]
                           ;; Card b does not start with a collection_position
                           Card       [b {:name "b", :collection_id coll-id}]
                           Dashboard  [_ {:name "c", :collection_id coll-id, :collection_position 2}]
                           Card       [_ {:name "d", :collection_id coll-id, :collection_position 3}]]
             (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
             ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id b))
              {:collection_position 2})
             (get-name->collection-position :rasta coll-id))))))

(deftest update-an-existing-card-to-no-longer-have-a-position--should-dec-items-after-it-s-position
  (is (= {"a" 1
          "b" nil
          "c" 2
          "d" 3}
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp Collection [collection]
             (with-ordered-items collection [Card      a
                                             Card      b
                                             Dashboard c
                                             Pulse     d]
               (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
               ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id b))
                {:collection_position nil})
               (get-name->collection-position :rasta collection)))))))

;; Change the collection the card is in, leave the position, should cause old and new collection to have their
;; positions updated
(deftest update-collection-positions
  (is (= [{"a" 1
           "f" 2
           "b" 3
           "c" 4
           "d" 5}
          {"e" 1
           "g" 2
           "h" 3}]
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [collection-1]
                           Collection [collection-2]]
             (with-ordered-items collection-1 [Dashboard a
                                               Card      b
                                               Pulse     c
                                               Dashboard d]
               (with-ordered-items collection-2 [Pulse     e
                                                 Card      f
                                                 Card      g
                                                 Dashboard h]
                 (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-1)
                 (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-2)
                 ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id f))
                  {:collection_id (u/get-id collection-1)})
                 [(get-name->collection-position :rasta collection-1)
                  (get-name->collection-position :rasta collection-2)])))))))

(deftest change-the-collection-and-the-position--causing-both-collections-and-the-updated-card-to-have-their-order-changed
  (is (= [{"h" 1
           "a" 2
           "b" 3
           "c" 4
           "d" 5}
          {"e" 1
           "f" 2
           "g" 3}]
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [collection-1]
                           Collection [collection-2]]
             (with-ordered-items collection-1 [Pulse     a
                                               Pulse     b
                                               Dashboard c
                                               Dashboard d]
               (with-ordered-items collection-2 [Dashboard e
                                                 Dashboard f
                                                 Pulse     g
                                                 Card      h]
                 (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-1)
                 (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-2)
                 ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id h))
                  {:collection_position 1, :collection_id (u/get-id collection-1)})
                 [(get-name->collection-position :rasta collection-1)
                  (get-name->collection-position :rasta collection-2)])))))))


;; Add a new card to an existing collection at position 1, will cause all existing positions to increment by 1
(deftest add-new-card-to-existing-collection-at-position-1
  (is (=
       ;; Original collection, before adding the new card
       [{"b" 1
         "c" 2
         "d" 3}
        ;; Add new card at index 1
        {"a" 1
         "b" 2
         "c" 3
         "d" 4}]
       (tu/with-non-admin-groups-no-root-collection-perms
         (tt/with-temp Collection [collection]
           (tu/with-model-cleanup [Card]
             (with-ordered-items collection [Dashboard b
                                             Pulse     c
                                             Card      d]
               (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
               [(get-name->collection-position :rasta collection)
                (do
                  ((mt/user->client :rasta) :post 202 "card"
                   (merge (card-with-name-and-query "a")
                          {:collection_id       (u/get-id collection)
                           :collection_position 1}))
                  (get-name->collection-position :rasta collection))])))))))

(deftest add-new-card-to-end-of-existing-collection
  ;; Add a new card to the end of an existing collection
  (is (=
       ;; Original collection, before adding the new card
       [{"a" 1
         "b" 2
         "c" 3}
        ;; Add new card at index 4
        {"a" 1
         "b" 2
         "c" 3
         "d" 4}]
       (tu/with-non-admin-groups-no-root-collection-perms
         (tt/with-temp Collection [collection]
           (tu/with-model-cleanup [Card]
             (with-ordered-items collection [Card      a
                                             Dashboard b
                                             Pulse     c]
               (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
               [(get-name->collection-position :rasta collection)
                (do
                  ((mt/user->client :rasta) :post 202 "card"
                   (merge (card-with-name-and-query "d")
                          {:collection_id       (u/get-id collection)
                           :collection_position 4}))
                  (get-name->collection-position :rasta collection))])))))))

;; When adding a new card to a collection that does not have a position, it should not change existing positions
(deftest adding-card-doesn-not-change-existing-positions
  (is (=
       ;; Original collection, before adding the new card
       [{"a" 1
         "b" 2
         "c" 3}
        ;; Add new card without a position
        {"a" 1
         "b" 2
         "c" 3
         "d" nil}]
       (tu/with-non-admin-groups-no-root-collection-perms
         (tt/with-temp Collection [collection]
           (tu/with-model-cleanup [Card]
             (with-ordered-items collection [Pulse     a
                                             Card      b
                                             Dashboard c]
               (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
               [(get-name->collection-position :rasta collection)
                (do
                  ((mt/user->client :rasta) :post 202 "card"
                   (merge (card-with-name-and-query "d")
                          {:collection_id       (u/get-id collection)
                           :collection_position nil}))
                  (get-name->collection-position :rasta collection))]))))))

  (is (= {"d" 1
          "a" 2
          "b" 3
          "c" 4
          "e" 5
          "f" 6}
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp Collection [collection]
             (with-ordered-items collection [Dashboard a
                                             Dashboard b
                                             Card      c
                                             Card      d
                                             Pulse     e
                                             Pulse     f]
               (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
               ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id d))
                {:collection_position 1, :collection_id (u/get-id collection)})
               (name->position ((mt/user->client :rasta) :get 200 (format "collection/%s/items" (u/get-id collection))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Card updates that impact alerts                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- rasta-alert-not-working [body-map]
  (et/email-to :rasta {:subject "One of your alerts has stopped working"
                       :body    body-map}))

(defn- crowberto-alert-not-working [body-map]
  (et/email-to :crowberto {:subject "One of your alerts has stopped working"
                           :body    body-map}))

(deftest alert-deletion-test
  (doseq [{:keys [message card expected-email f]}
          [{:message        "Archiving a Card should trigger Alert deletion"
            :expected-email "the question was archived by Rasta Toucan"
            :f              (fn [{:keys [card]}]
                              ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:archived true}))}
           {:message        "Validate changing a display type triggers alert deletion"
            :card           {:display :table}
            :expected-email "the question was edited by Rasta Toucan"
            :f              (fn [{:keys [card]}]
                              ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:display :line}))}
           {:message        "Changing the display type from line to table should force a delete"
            :card           {:display :line}
            :expected-email "the question was edited by Rasta Toucan"
            :f              (fn [{:keys [card]}]
                              ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:display :table}))}
           {:message        "Removing the goal value will trigger the alert to be deleted"
            :card           {:display                :line
                             :visualization_settings {:graph.goal_value 10}}
            :expected-email "the question was edited by Rasta Toucan"
            :f              (fn [{:keys [card]}]
                              ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:visualization_settings {:something "else"}}))}
           {:message        "Adding an additional breakout will cause the alert to be removed"
            :card           {:display                :line
                             :visualization_settings {:graph.goal_value 10}
                             :dataset_query          (assoc-in
                                                      (mbql-count-query (data/id) (data/id :checkins))
                                                      [:query :breakout]
                                                      [["datetime-field"
                                                        (data/id :checkins :date)
                                                        "hour"]])}
            :expected-email "the question was edited by Crowberto Corv"
            :f              (fn [{:keys [card]}]
                              ((mt/user->client :crowberto) :put 202 (str "card/" (u/get-id card))
                               {:dataset_query (assoc-in (mbql-count-query (data/id) (data/id :checkins))
                                                         [:query :breakout] [[:datetime-field (data/id :checkins :date) "hour"]
                                                                             [:datetime-field (data/id :checkins :date) "minute"]])}))}]]
    (testing message
      (tt/with-temp* [Card                  [card  card]
                      Pulse                 [pulse {:alert_condition  "rows"
                                                    :alert_first_only false
                                                    :creator_id       (mt/user->id :rasta)
                                                    :name             "Original Alert Name"}]

                      PulseCard             [_     {:pulse_id (u/get-id pulse)
                                                    :card_id  (u/get-id card)
                                                    :position 0}]
                      PulseChannel          [pc    {:pulse_id (u/get-id pulse)}]
                      PulseChannelRecipient [_     {:user_id          (mt/user->id :crowberto)
                                                    :pulse_channel_id (u/get-id pc)}]
                      PulseChannelRecipient [_     {:user_id          (mt/user->id :rasta)
                                                    :pulse_channel_id (u/get-id pc)}]]
        (with-cards-in-writeable-collection card
          (et/with-fake-inbox
            (metabase.util/with-timeout 5000
              (et/with-expected-messages 2
                (f {:card card})))
            (is (= (merge (crowberto-alert-not-working {expected-email true})
                          (rasta-alert-not-working     {expected-email true}))
                   (et/regex-email-bodies (re-pattern expected-email)))
                (format "Email containing %s should have been sent to Crowberto and Rasta" (pr-str expected-email)))
            (is (= nil
                   (Pulse (u/get-id pulse)))
                "Alert should have been deleted")))))))

(deftest changing-the-display-type-from-line-to-area-bar-is-fine-and-doesnt-delete-the-alert
  (is (= {:emails-1 {}
          :pulse-1  true
          :emails-2 {}
          :pulse-2  true}
         (tt/with-temp* [Card                  [card  {:display                :line
                                                       :visualization_settings {:graph.goal_value 10}}]
                         Pulse                 [pulse {:alert_condition  "goal"
                                                       :alert_first_only false
                                                       :creator_id       (mt/user->id :rasta)
                                                       :name             "Original Alert Name"}]
                         PulseCard             [_     {:pulse_id (u/get-id pulse)
                                                       :card_id  (u/get-id card)
                                                       :position 0}]
                         PulseChannel          [pc    {:pulse_id (u/get-id pulse)}]
                         PulseChannelRecipient [_     {:user_id          (mt/user->id :rasta)
                                                       :pulse_channel_id (u/get-id pc)}]]
           (with-cards-in-writeable-collection card
             (et/with-fake-inbox
               (array-map
                :emails-1 (do
                            ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:display :area})
                            (et/regex-email-bodies #"the question was edited by Rasta Toucan"))
                :pulse-1  (boolean (Pulse (u/get-id pulse)))
                :emails-2 (do
                            ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:display :bar})
                            (et/regex-email-bodies #"the question was edited by Rasta Toucan"))
                :pulse-2  (boolean (Pulse (u/get-id pulse))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DELETING A CARD (DEPRECATED)                                          |
;;; +----------------------------------------------------------------------------------------------------------------+
;; Deprecated because you're not supposed to delete cards anymore. Archive them instead

(deftest check-that-we-can-delete-a-card
  (is (nil? (tt/with-temp Card [card]
              (with-cards-in-writeable-collection card
                ((mt/user->client :rasta) :delete 204 (str "card/" (u/get-id card)))
                (Card (u/get-id card)))))))

;; deleting a card that doesn't exist should return a 404 (#1957)
(deftest deleting-a-card-that-doesnt-exist-should-return-a-404---1957-
  (is (= "Not found."
         ((mt/user->client :crowberto) :delete 404 "card/12345"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   FAVORITING                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Helper Functions
(defn- fave? [card]
  (db/exists? CardFavorite, :card_id (u/get-id card), :owner_id (mt/user->id :rasta)))

(defn- fave! [card]
  ((mt/user->client :rasta) :post 200 (format "card/%d/favorite" (u/get-id card))))

(defn- unfave! [card]
  ((mt/user->client :rasta) :delete 204 (format "card/%d/favorite" (u/get-id card))))

;; ## GET /api/card/:id/favorite
(deftest can-we-see-if-a-card-is-a-favorite--
  (is (= false
         (tt/with-temp Card [card]
           (with-cards-in-readable-collection card
             (fave? card))))))

(deftest favorite-test
  (testing "Can we favorite a Card?"
    (testing "POST /api/card/:id/favorite"
      (tt/with-temp Card [card]
        (with-cards-in-readable-collection card
          (is (= false
                 (fave? card)))
          (fave! card)
          (is (= true
                 (fave? card))))))))

(deftest unfavorite-test
  (testing "Can we unfavorite a Card?"
    (testing "DELETE /api/card/:id/favorite"
      (tt/with-temp Card [card]
        (with-cards-in-readable-collection card
          (is (= false
                 (fave? card)))
          (fave! card)
          (is (= true
                 (fave? card)))
          (unfave! card)
          (is (= false
                 (fave? card))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            CSV/JSON/XLSX DOWNLOADS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; Test GET /api/card/:id/query/csv & GET /api/card/:id/json & GET /api/card/:id/query/xlsx **WITH PARAMETERS**
(def ^:private ^:const ^String encoded-params
  (json/generate-string [{:type   :category
                          :target [:variable [:template-tag :category]]
                          :value  2}]))

(deftest csv-download-test
  (testing "no parameters"
    (with-temp-native-card [_ card]
      (with-cards-in-readable-collection card
        (is (= ["COUNT(*)"
                "75"]
               (str/split-lines
                ((mt/user->client :rasta) :post 202 (format "card/%d/query/csv"
                                                                    (u/get-id card)))))))))
  (testing "with-paramters"
    (with-temp-native-card-with-params [_ card]
      (with-cards-in-readable-collection card
        (is (= ["COUNT(*)"
                "8"]
               (str/split-lines
                ((mt/user->client :rasta) :post 202 (format "card/%d/query/csv?parameters=%s"
                                                                    (u/get-id card) encoded-params)))))))))

(deftest json-download-test
  (testing "no parameters"
    (with-temp-native-card [_ card]
      (with-cards-in-readable-collection card
        (is (= [{(keyword "COUNT(*)") 75}]
               ((mt/user->client :rasta) :post 202 (format "card/%d/query/json" (u/get-id card))))))))
  (testing "with parameters"
    (with-temp-native-card-with-params [_ card]
      (with-cards-in-readable-collection card
        (is (= [{(keyword "COUNT(*)") 8}]
               ((mt/user->client :rasta) :post 202 (format "card/%d/query/json?parameters=%s"
                                                                   (u/get-id card) encoded-params))))))))

(defn- parse-xlsx-results [results]
  (->> results
       ByteArrayInputStream.
       spreadsheet/load-workbook
       (spreadsheet/select-sheet "Query result")
       (spreadsheet/select-columns {:A :col})))

(deftest xlsx-download-test
  (testing "no parameters"
    (with-temp-native-card [_ card]
      (with-cards-in-readable-collection card
        (is (= [{:col "COUNT(*)"} {:col 75.0}]
               (parse-xlsx-results
                ((mt/user->client :rasta) :post 202 (format "card/%d/query/xlsx" (u/get-id card))
                 {:request-options {:as :byte-array}})))))))
  (testing "with parameters"
    (with-temp-native-card-with-params [_ card]
      (with-cards-in-readable-collection card
        (is (= [{:col "COUNT(*)"} {:col 8.0}]
               (parse-xlsx-results
                ((mt/user->client :rasta) :post 202 (format "card/%d/query/xlsx?parameters=%s"
                                                                    (u/get-id card) encoded-params)
                 {:request-options {:as :byte-array}}))))))))

(deftest download-default-constraints-test
  (tt/with-temp Card [card {:dataset_query {:database   (data/id)
                                            :type       :query
                                            :query      {:source-table (data/id :venues)}
                                            :middleware {:add-default-userland-constraints? true
                                                         :userland-query?                   true}}}]
    (with-cards-in-readable-collection card
      (let [orig card-api/run-query-for-card-async]
        (with-redefs [card-api/run-query-for-card-async (fn [card-id export-format & options]
                                                          (apply orig card-id export-format
                                                                 :run (fn [{:keys [constraints]} _]
                                                                        {:constraints constraints})
                                                                 options))]
          (testing "Sanity check: this CSV download should not be subject to C O N S T R A I N T S"
            (is (= {:constraints nil}
                   ((mt/user->client :rasta) :post 200 (format "card/%d/query/csv" (u/get-id card))))))
          (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
            (testing (str "Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints -- even "
                          "if the query comes in with `add-default-userland-constraints` (as will be the case if the query "
                          "gets saved from one that had it -- see #9831)")
              (is (= {:constraints nil}
                     ((mt/user->client :rasta) :post 200 (format "card/%d/query/csv" (u/get-id card))))))

            (testing (str "non-\"download\" queries should still get the default constraints (this also is a sanitiy "
                          "check to make sure the `with-redefs` in the test above actually works)")
              (is (= {:constraints {:max-results 10, :max-results-bare-rows 10}}
                     ((mt/user->client :rasta) :post 200 (format "card/%d/query" (u/get-id card))))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  COLLECTIONS                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest make-sure-we-can-create-a-card-and-specify-its--collection-id--at-the-same-time
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (tu/with-model-cleanup [Card]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (let [card ((mt/user->client :rasta) :post 202 "card"
                    (assoc (card-with-name-and-query)
                           :collection_id (u/get-id collection)))]
          (= (db/select-one-field :collection_id Card :id (u/get-id card))
             (u/get-id collection)))))))

(deftest make-sure-we-card-creation-fails-if-we-try-to-set-a--collection-id--we-don-t-have-permissions-for
  (is (= "You don't have permissions to do that."
         (tu/with-non-admin-groups-no-root-collection-perms
           (tu/with-model-cleanup [Card]
             (tt/with-temp Collection [collection]
               ((mt/user->client :rasta) :post 403 "card"
                (assoc (card-with-name-and-query)
                       :collection_id (u/get-id collection)))))))))

(deftest make-sure-we-can-change-the--collection-id--of-a-card-if-it-s-not-in-any-collection
  (tt/with-temp* [Card       [card]
                  Collection [collection]]
    ((mt/user->client :crowberto) :put 202 (str "card/" (u/get-id card)) {:collection_id (u/get-id collection)})
    (= (db/select-one-field :collection_id Card :id (u/get-id card))
       (u/get-id collection))))

(deftest make-sure-we-can-still-change--anything--for-a-card-if-we-don-t-have-permissions-for-the-collection-it-belongs-to
  (is (= "You don't have permissions to do that."
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [collection]
                           Card       [card       {:collection_id (u/get-id collection)}]]
             ((mt/user->client :rasta) :put 403 (str "card/" (u/get-id card))
              {:name "Number of Blueberries Consumed Per Month"}))))))


;; Make sure that we can't change the `collection_id` of a Card if we don't have write permissions for the new
;; collection
(deftest cant-change-collection-id-of-card-without-write-permission-in-new-collection
  (is (= "You don't have permissions to do that."
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [original-collection]
                           Collection [new-collection]
                           Card       [card                {:collection_id (u/get-id original-collection)}]]
             (perms/grant-collection-readwrite-permissions! (perms-group/all-users) original-collection)
             ((mt/user->client :rasta) :put 403 (str "card/" (u/get-id card))
              {:collection_id (u/get-id new-collection)}))))))


;; Make sure that we can't change the `collection_id` of a Card if we don't have write permissions for the current
;; collection
(deftest cant-change-collection-id-of-card-without-write-permission-in-current-collection
  (is (= "You don't have permissions to do that."
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [original-collection]
                           Collection [new-collection]
                           Card       [card                {:collection_id (u/get-id original-collection)}]]
             (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
             ((mt/user->client :rasta) :put 403 (str "card/" (u/get-id card))
              {:collection_id (u/get-id new-collection)}))))))



(deftest but-if-we-do-have-permissions-for-both--we-should-be-able-to-change-it-
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [original-collection]
                    Collection [new-collection]
                    Card       [card                {:collection_id (u/get-id original-collection)}]]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) original-collection)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
      ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card)) {:collection_id (u/get-id new-collection)})
      (= (db/select-one-field :collection_id Card :id (u/get-id card))
         (u/get-id new-collection)))))

;;; ------------------------------ Bulk Collections Update (POST /api/card/collections) ------------------------------

(defn- collection-names
  "Given a sequences of `cards-or-card-ids`, return a corresponding sequence of names of the Collection each Card is
  in."
  [cards-or-card-ids]
  (when (seq cards-or-card-ids)
    (let [cards               (db/select [Card :collection_id] :id [:in (map u/get-id cards-or-card-ids)])
          collection-ids      (set (filter identity (map :collection_id cards)))
          collection-id->name (when (seq collection-ids)
                                (db/select-id->field :name Collection :id [:in collection-ids]))]
      (for [card cards]
        (get collection-id->name (:collection_id card))))))

(defn- POST-card-collections!
  "Update the Collection of `cards-or-card-ids` via the `POST /api/card/collections` endpoint using `username`; return
  the response of this API request and the latest Collection IDs from the database."
  [username expected-status-code collection-or-collection-id-or-nil cards-or-card-ids]
  (array-map
   :response
   ((mt/user->client username) :post expected-status-code "card/collections"
    {:collection_id (when collection-or-collection-id-or-nil
                      (u/get-id collection-or-collection-id-or-nil))
     :card_ids      (map u/get-id cards-or-card-ids)})

   :collections
   (collection-names cards-or-card-ids)))

(deftest test-that-we-can-bulk-move-some-cards-with-no-collection-into-a-collection
  (is (= {:response    {:status "ok"}
          :collections ["Pog Collection"
                        "Pog Collection"]}
         (tt/with-temp* [Collection [collection {:name "Pog Collection"}]
                         Card       [card-1]
                         Card       [card-2]]
           (POST-card-collections! :crowberto 200 collection [card-1 card-2])))))

(deftest test-that-we-can-bulk-move-some-cards-from-one-collection-to-another
  (is (= {:response    {:status "ok"}
          :collections ["New Collection" "New Collection"]}
         (tt/with-temp* [Collection [old-collection {:name "Old Collection"}]
                         Collection [new-collection {:name "New Collection"}]
                         Card       [card-1         {:collection_id (u/get-id old-collection)}]
                         Card       [card-2         {:collection_id (u/get-id old-collection)}]]
           (POST-card-collections! :crowberto 200 new-collection [card-1 card-2])))))

(deftest test-that-we-can-bulk-remove-some-cards-from-a-collection
  (is (= {:response    {:status "ok"}
          :collections [nil nil]}
         (tt/with-temp* [Collection [collection]
                         Card       [card-1     {:collection_id (u/get-id collection)}]
                         Card       [card-2     {:collection_id (u/get-id collection)}]]
           (POST-card-collections! :crowberto 200 nil [card-1 card-2])))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-destination-collection
  (is (= {:response    "You don't have permissions to do that."
          :collections [nil nil]}
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [collection]
                           Card       [card-1]
                           Card       [card-2]]
             (POST-card-collections! :rasta 403 collection [card-1 card-2]))))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-source-collection
  (is (= {:response    "You don't have permissions to do that."
          :collections ["Horseshoe Collection" "Horseshoe Collection"]}
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [collection {:name "Horseshoe Collection"}]
                           Card       [card-1     {:collection_id (u/get-id collection)}]
                           Card       [card-2     {:collection_id (u/get-id collection)}]]
             (POST-card-collections! :rasta 403 nil [card-1 card-2]))))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-the-card
  (is (= {:response    "You don't have permissions to do that."
          :collections [nil nil]}
         (tu/with-non-admin-groups-no-root-collection-perms
           (tt/with-temp* [Collection [collection]
                           Database   [database]
                           Table      [table      {:db_id (u/get-id database)}]
                           Card       [card-1     {:dataset_query (mbql-count-query (u/get-id database) (u/get-id table))}]
                           Card       [card-2     {:dataset_query (mbql-count-query (u/get-id database) (u/get-id table))}]]
             (perms/revoke-permissions! (perms-group/all-users) (u/get-id database))
             (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
             (POST-card-collections! :rasta 403 collection [card-1 card-2]))))))

;; Test that we can bulk move some Cards from one collection to another, while updating the collection position of the
;; old collection and the new collection
(deftest bulk-move-cards
  (is (= [{:response    {:status "ok"}
           :collections ["New Collection" "New Collection"]}
          {"a" 4                               ;-> Moved to the new collection, gets the first slot available
           "b" 5
           "c" 1                               ;-> With a and b no longer in the collection, c is first
           "d" 1                               ;-> Existing cards in new collection are untouched and position unchanged
           "e" 2
           "f" 3}]
         (tt/with-temp* [Collection [{coll-id-1 :id}      {:name "Old Collection"}]
                         Collection [{coll-id-2 :id
                                      :as new-collection} {:name "New Collection"}]
                         Card       [card-a               {:name "a", :collection_id coll-id-1, :collection_position 1}]
                         Card       [card-b               {:name "b", :collection_id coll-id-1, :collection_position 2}]
                         Card       [card-c               {:name "c", :collection_id coll-id-1, :collection_position 3}]
                         Card       [card-d               {:name "d", :collection_id coll-id-2, :collection_position 1}]
                         Card       [card-e               {:name "e", :collection_id coll-id-2, :collection_position 2}]
                         Card       [card-f               {:name "f", :collection_id coll-id-2, :collection_position 3}]]
           [(POST-card-collections! :crowberto 200 new-collection [card-a card-b])
            (merge (name->position ((mt/user->client :crowberto) :get 200 (format "collection/%s/items" coll-id-1)  :model "card" :archived "false"))
                   (name->position ((mt/user->client :crowberto) :get 200 (format "collection/%s/items" coll-id-2)  :model "card" :archived "false")))]))))

(deftest moving-a-card-without-a-collection-position-keeps-the-collection-position-nil
  (is (= [{:response    {:status "ok"}
           :collections ["New Collection" "New Collection"]}
          {"a" nil
           "b" 1
           "c" 2}]
         (tt/with-temp* [Collection [{coll-id-1 :id}      {:name "Old Collection"}]
                         Collection [{coll-id-2 :id
                                      :as new-collection} {:name "New Collection"}]
                         Card       [card-a               {:name "a", :collection_id coll-id-1}]
                         Card       [card-b               {:name "b", :collection_id coll-id-2, :collection_position 1}]
                         Card       [card-c               {:name "c", :collection_id coll-id-2, :collection_position 2}]]
           [(POST-card-collections! :crowberto 200 new-collection [card-a card-b])
            (merge (name->position ((mt/user->client :crowberto) :get 200 (format "collection/%s/items" coll-id-1)  :model "card" :archived "false"))
                   (name->position ((mt/user->client :crowberto) :get 200 (format "collection/%s/items" coll-id-2)  :model "card" :archived "false")))]))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- shared-card []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

;;; ----------------------------------------- POST /api/card/:id/public_link -----------------------------------------


(deftest test-that-we-can-share-a-card
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card]
      (let [{uuid :uuid} ((mt/user->client :crowberto) :post 200 (format "card/%d/public_link" (u/get-id card)))]
        (is (= true
               (boolean (db/exists? Card :id (u/get-id card), :public_uuid uuid))))))))

(deftest test-that-we--cannot--share-a-card-if-we-aren-t-admins
  (is (= "You don't have permissions to do that."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [card]
             ((mt/user->client :rasta) :post 403 (format "card/%d/public_link" (u/get-id card))))))))

(deftest test-that-we--cannot--share-a-card-if-the-setting-is-disabled
  (is (= "Public sharing is not enabled."
         (tu/with-temporary-setting-values [enable-public-sharing false]
           (tt/with-temp Card [card]
             ((mt/user->client :crowberto) :post 400 (format "card/%d/public_link" (u/get-id card))))))))

(deftest test-that-we--cannot--share-a-card-if-the-card-has-been-archived
  (is (= {:message "The object has been archived.", :error_code "archived"}
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [card {:archived true}]
             ((mt/user->client :crowberto) :post 404 (format "card/%d/public_link" (u/get-id card))))))))

(deftest test-that-we-get-a-404-if-the-card-doesnt-exist
  (is (= "Not found."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           ((mt/user->client :crowberto) :post 404 (format "card/%d/public_link" Integer/MAX_VALUE))))))

(deftest test-that-if-a-card-has-already-been-shared-we-re-se-the-existing-uuid
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      (= (:public_uuid card)
         (:uuid ((mt/user->client :crowberto) :post 200 (format "card/%d/public_link" (u/get-id card))))))))

;;; ---------------------------------------- DELETE /api/card/:id/public_link ----------------------------------------

(deftest test-that-we-can-unshare-a-card
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      ((mt/user->client :crowberto) :delete 204 (format "card/%d/public_link" (u/get-id card)))
      (is (= false
             (db/exists? Card :id (u/get-id card), :public_uuid (:public_uuid card)))))))

(deftest test-that-we--cannot--unshare-a-card-if-we-are-not-admins
  (is (= "You don't have permissions to do that."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [card (shared-card)]
             ((mt/user->client :rasta) :delete 403 (format "card/%d/public_link" (u/get-id card))))))))

(deftest test-that-we-get-a-404-if-card-isn-t-shared
  (is (= "Not found."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           (tt/with-temp Card [card]
             ((mt/user->client :crowberto) :delete 404 (format "card/%d/public_link" (u/get-id card))))))))

(deftest test-that-we-get-a-404-if-card-doesnt-exist
  (is (= "Not found."
         (tu/with-temporary-setting-values [enable-public-sharing true]
           ((mt/user->client :crowberto) :delete 404 (format "card/%d/public_link" Integer/MAX_VALUE))))))

(deftest test-that-we-can-fetch-a-list-of-publicly-accessible-cards
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      (is (= [{:name true, :id true, :public_uuid true}]
             (for [card ((mt/user->client :crowberto) :get 200 "card/public")]
               (m/map-vals boolean (select-keys card [:name :id :public_uuid]))))))))

(deftest test-that-we-can-fetch-a-list-of-embeddable-cards
  (tu/with-temporary-setting-values [enable-embedding true]
    (tt/with-temp Card [card {:enable_embedding true}]
      (is (= [{:name true, :id true}]
             (for [card ((mt/user->client :crowberto) :get 200 "card/embeddable")]
               (m/map-vals boolean (select-keys card [:name :id]))))))))

(deftest test-related-recommended-entities
  (tt/with-temp Card [card]
    (is (= #{:table :metrics :segments :dashboard-mates :similar-questions :canonical-metric :dashboards :collections}
           (-> ((mt/user->client :crowberto) :get 200 (format "card/%s/related" (u/get-id card))) keys set)))))
