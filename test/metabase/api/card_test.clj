(ns metabase.api.card-test
  "Tests for /api/card endpoints."
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [java-time :as t]
            [medley.core :as m]
            [metabase.api.card :as card-api]
            [metabase.api.pivots :as pivots]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.http-client :as http]
            [metabase.models :refer [Card CardFavorite Collection Dashboard Database ModerationReview
                                     Pulse PulseCard PulseChannel PulseChannelRecipient Table ViewLog]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.revision :as revision :refer [Revision]]
            [metabase.models.user :refer [User]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.async :as qp.async]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.query-processor.middleware.results-metadata :as results-metadata]
            [metabase.server.middleware.util :as middleware.u]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.io.ByteArrayInputStream
           java.util.UUID))

(comment card-api/keep-me)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- count-base-type []
  (-> (mt/run-mbql-query venues {:aggregation [[:count]]}) :data :cols first :base_type))

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
   :moderation_reviews  ()
   :public_uuid         nil
   :query_type          nil
   :cache_ttl           nil
   :result_metadata     nil})

(defn mbql-count-query
  ([]
   (mbql-count-query (mt/id) (mt/id :venues)))

  ([db-or-id table-or-id]
   {:database (u/the-id db-or-id)
    :type     :query
    :query    {:source-table (u/the-id table-or-id), :aggregation [[:count]]}}))

(defn card-with-name-and-query
  ([]
   (card-with-name-and-query (mt/random-name)))

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
  (mt/with-temp* [Database   [db    {:details (:details (mt/db)), :engine :h2}]
                  Table      [table {:db_id (u/the-id db), :name "CATEGORIES"}]
                  Card       [card  {:dataset_query {:database (u/the-id db)
                                                     :type     :native
                                                     :native   {:query "SELECT COUNT(*) FROM CATEGORIES;"}}}]]
    (f db card)))

(defmacro ^:private with-temp-native-card
  {:style/indent 1}
  [[db-binding card-binding] & body]
  `(do-with-temp-native-card (fn [~(or db-binding '_) ~(or card-binding '_)]
                               ~@body)))

(defn do-with-cards-in-a-collection [card-or-cards-or-ids grant-perms-fn! f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp Collection [collection]
      ;; put all the Card(s) in our temp `collection`
      (doseq [card-or-id (if (sequential? card-or-cards-or-ids)
                           card-or-cards-or-ids
                           [card-or-cards-or-ids])]
        (db/update! Card (u/the-id card-or-id) {:collection_id (u/the-id collection)}))
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
  (mt/with-temp*
    [Database   [db    {:details (:details (mt/db)), :engine :h2}]
     Table      [table {:db_id (u/the-id db), :name "VENUES"}]
     Card       [card  {:dataset_query
                        {:database (u/the-id db)
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
  (contains? (set (for [card (mt/user-http-request :rasta :get 200 "card", :f model, :model_id (u/the-id object-or-id))]
                    (u/the-id card)))
             (u/the-id card-or-id)))

(deftest filter-cards-by-db-test
  (mt/with-temp* [Database [db]
                  Card     [card-1 {:database_id (mt/id)}]
                  Card     [card-2 {:database_id (u/the-id db)}]]
    (with-cards-in-readable-collection [card-1 card-2]
      (is (= true
             (card-returned? :database (mt/id) card-1)))
      (is (= false
             (card-returned? :database db        card-1)))
      (is (= true
             (card-returned? :database db        card-2))))))


(deftest authentication-test
  (is (= (get middleware.u/response-unauthentic :body) (http/client :get 401 "card")))
  (is (= (get middleware.u/response-unauthentic :body) (http/client :put 401 "card/13"))))

(deftest model-id-requied-when-f-is-database-test
  (is (= {:errors {:model_id "model_id is a required parameter when filter mode is 'database'"}}
         (mt/user-http-request :crowberto :get 400 "card" :f :database))))

(deftest filter-cards-by-table-test
  (testing "Filter cards by table"
    (mt/with-temp* [Database [db]
                    Table    [table-1  {:db_id (u/the-id db)}]
                    Table    [table-2  {:db_id (u/the-id db)}]
                    Card     [card-1   {:table_id (u/the-id table-1)}]
                    Card     [card-2   {:table_id (u/the-id table-2)}]]
      (with-cards-in-readable-collection [card-1 card-2]
        (is (= true
               (card-returned? :table (u/the-id table-1) (u/the-id card-1))))
        (is (= false
               (card-returned? :table (u/the-id table-2) (u/the-id card-1))))
        (is (= true
               (card-returned? :table (u/the-id table-2) (u/the-id card-2))))))))

;; Make sure `model_id` is required when `f` is :table
(deftest model_id-requied-when-f-is-table
  (is (= {:errors {:model_id "model_id is a required parameter when filter mode is 'table'"}}
         (mt/user-http-request :crowberto :get 400 "card", :f :table))))

(defn- do-with-card-views [card-or-id+username f]
  (let [[f] (reduce
             (fn [[f timestamp] [card-or-id username]]
               [(fn []
                  (let [card-id   (u/the-id card-or-id)
                        card-name (db/select-one-field :name Card :id card-id)]
                    (testing (format "\nCard %d %s viewed by %s on %s" card-id (pr-str card-name) username timestamp)
                      (mt/with-temp ViewLog [_ {:model     "card"
                                                :model_id  card-id
                                                :user_id   (mt/user->id username)
                                                :timestamp timestamp}]
                        (f)))))
                (t/plus timestamp (t/days 1))])
             [f (t/zoned-date-time)]
             card-or-id+username)]
    (f)))

(defmacro ^:private with-card-views [card-or-id+username & body]
  `(do-with-card-views ~(mapv vec (partition 2 card-or-id+username)) (fn [] ~@body)))

(deftest filter-by-recent-test
  (testing "GET /api/card?f=recent"
    (mt/with-temp* [Card [card-1 {:name "Card 1"}]
                    Card [card-2 {:name "Card 2"}]
                    Card [card-3 {:name "Card 3"}]
                    Card [card-4 {:name "Card 4"}]]
      ;; 3 was viewed most recently, followed by 4, then 1. Card 2 was viewed by a different user so shouldn't be
      ;; returned
      (with-card-views [card-1 :rasta
                        card-2 :trashbird
                        card-3 :rasta
                        card-4 :rasta
                        card-3 :rasta]
        (with-cards-in-readable-collection [card-1 card-2 card-3 card-4]
          (testing "\nShould return cards that were recently viewed by current user only"
            (is (= ["Card 3"
                    "Card 4"
                    "Card 1"]
                   (map :name (mt/user-http-request :rasta :get 200 "card", :f :recent))))))))))

(deftest filter-by-popular-test
  (testing "GET /api/card?f=popular"
    (mt/with-temp* [Card [card-1 {:name "Card 1"}]
                    Card [card-2 {:name "Card 2"}]
                    Card [card-3 {:name "Card 3"}]]
      ;; 3 entries for card 3, 2 for card 2, none for card 1,
      (with-card-views [card-3 :rasta
                        card-2 :trashbird
                        card-2 :rasta
                        card-3 :crowberto
                        card-3 :rasta]
        (with-cards-in-readable-collection [card-1 card-2 card-3]
          (testing (str "`f=popular` should return cards sorted by number of ViewLog entries for all users; cards with "
                        "no entries should be excluded")
            (is (= ["Card 3"
                    "Card 2"]
                   (map :name (mt/user-http-request :rasta :get 200 "card", :f :popular))))))))))

(deftest filter-by-archived-test
  (testing "GET /api/card?f=archived"
    (mt/with-temp* [Card [card-1 {:name "Card 1"}]
                    Card [card-2 {:name "Card 2", :archived true}]
                    Card [card-3 {:name "Card 3", :archived true}]]
      (with-cards-in-readable-collection [card-1 card-2 card-3]
        (is (= #{"Card 2" "Card 3"}
               (set (map :name (mt/user-http-request :rasta :get 200 "card", :f :archived))))
            "The set of Card returned with f=archived should be equal to the set of archived cards")))))

(deftest filter-by-fav-test
  (testing "Filter by `fav`"
    (mt/with-temp* [Card         [card-1 {:name "Card 1"}]
                    Card         [card-2 {:name "Card 2"}]
                    Card         [card-3 {:name "Card 3"}]
                    CardFavorite [_ {:card_id (u/the-id card-1), :owner_id (mt/user->id :rasta)}]
                    CardFavorite [_ {:card_id (u/the-id card-2), :owner_id (mt/user->id :crowberto)}]]
      (with-cards-in-readable-collection [card-1 card-2 card-3]
        (is (= [{:name "Card 1", :favorite true}]
               (for [card (mt/user-http-request :rasta :get 200 "card", :f :fav)]
                 (select-keys card [:name :favorite]))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        CREATING A CARD (POST /api/card)                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-a-card
  (testing "POST /api/card"
    (testing "Test that we can create a new Card"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [Card]
            (let [card (assoc (card-with-name-and-query (mt/random-name)
                                                        (mbql-count-query (mt/id) (mt/id :venues)))
                              :collection_id (u/the-id collection))]
              (is (= (merge
                      card-defaults
                      {:name                   (:name card)
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
                       :last-edit-info         {:timestamp true :id true :first_name "Rasta"
                                                :last_name "Toucan" :email "rasta@metabase.com"}
                       :creator                (merge
                                                (select-keys (mt/fetch-user :rasta) [:id :date_joined :last_login :locale])
                                                {:common_name  "Rasta Toucan"
                                                 :is_superuser false
                                                 :last_name    "Toucan"
                                                 :first_name   "Rasta"
                                                 :email        "rasta@metabase.com"})})
                     (-> (mt/user-http-request :rasta :post 202 "card" card)
                         (dissoc :created_at :updated_at :id)
                         (update :table_id integer?)
                         (update :database_id integer?)
                         (update :collection_id integer?)
                         (update :dataset_query map?)
                         (update :collection map?)
                         (update :result_metadata (partial every? map?))
                         (update :creator dissoc :is_qbnewb)
                         (update :last-edit-info (fn [edit-info]
                                                   (-> edit-info
                                                       (update :id boolean)
                                                       (update :timestamp boolean))))))))))))))

(deftest save-empty-card-test
  (testing "POST /api/card"
    (testing "Should be able to save an empty Card"
      (doseq [[query-description query] {"native query"
                                         (mt/native-query {:query "SELECT * FROM VENUES WHERE false;"})

                                         "MBQL query"
                                         (mt/mbql-query venues {:filter [:= $id 0]})}]
        (testing query-description
          (mt/with-model-cleanup [Card]
            (testing "without result metadata"
              (is (schema= {:id       su/IntGreaterThanZero
                            s/Keyword s/Any}
                           (mt/user-http-request :rasta :post 202 "card"
                                                 (merge (mt/with-temp-defaults Card)
                                                        {:dataset_query query})))))
            (let [metadata (-> (qp/process-query query)
                               :data
                               :results_metadata
                               :columns)]
              (testing (format "with result metadata\n%s" (u/pprint-to-str metadata))
                (is (some? metadata))
                (is (schema= {:id       su/IntGreaterThanZero
                              s/Keyword s/Any}
                             (mt/user-http-request :rasta :post 202 "card"
                                                   (merge (mt/with-temp-defaults Card)
                                                          {:dataset_query   query
                                                           :result_metadata metadata}))))))))))))

(deftest saving-card-saves-query-metadata
  (testing "Make sure when saving a Card the query metadata is saved (if correct)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [metadata  [{:base_type    :type/Integer
                        :display_name "Count Chocula"
                        :name         "count_chocula"}]
            card-name (mt/random-name)]
        (mt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [Card]
            ;; create a card with the metadata
            (mt/user-http-request :rasta :post 202 "card" (assoc (card-with-name-and-query card-name)
                                                                 :collection_id      (u/the-id collection)
                                                                 :result_metadata    metadata
                                                                 :metadata_checksum  (#'results-metadata/metadata-checksum metadata)))
            ;; now check the metadata that was saved in the DB
            (is (= [{:base_type    :type/Integer
                     :display_name "Count Chocula"
                     :name         "count_chocula"}]
                   (db/select-one-field :result_metadata Card :name card-name)))))))))

(deftest save-card-with-empty-result-metadata-test
  (testing "we should be able to save a Card if the `result_metadata` is *empty* (but not nil) (#9286)"
    (mt/with-model-cleanup [Card]
      (let [card        (card-with-name-and-query)
            md-checksum (#'results-metadata/metadata-checksum [])]
        (is (schema= {:id su/IntGreaterThanZero, s/Keyword s/Any}
                     (mt/user-http-request :rasta
                                           :post
                                           202
                                           "card"
                                           (assoc card :result_metadata   []
                                                       :metadata_checksum md-checksum))))))))

(defn- fingerprint-integers->doubles
  "Converts the min/max fingerprint values to doubles so simulate how the FE will change the metadata when POSTing a
  new card"
  [metadata]
  (update metadata :fingerprint (fn [fingerprint] (-> fingerprint
                                                      (update-in [:type :type/Number :min] double)
                                                      (update-in [:type :type/Number :max] double)))))

(deftest ints-returned-as-floating-point
  (testing (str "When integer values are passed to the FE, they will be returned as floating point values. Our hashing "
                "should ensure that integer and floating point values hash the same so we don't needlessly rerun the "
                "query"))
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [metadata  [{:base_type    :type/Integer
                      :display_name "Count Chocula"
                      :name         "count_chocula"
                      :fingerprint  {:global {:distinct-count 285},
                                     :type   {:type/Number {:min 5, :max 2384, :avg 1000.2}}}}]
          card-name (mt/random-name)]
      (mt/with-temp Collection [collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (mt/throw-if-called qp.async/result-metadata-for-query-async
          (mt/with-model-cleanup [Card]
            ;; create a card with the metadata
            (mt/user-http-request :rasta :post 202 "card"
                                  (assoc (card-with-name-and-query card-name)
                                         :collection_id      (u/the-id collection)
                                         :result_metadata    (map fingerprint-integers->doubles metadata)
                                         :metadata_checksum  (#'results-metadata/metadata-checksum metadata)))
            (testing "check the metadata that was saved in the DB"
              (is (= [{:base_type     :type/Integer
                       :display_name  "Count Chocula"
                       :name          "count_chocula"
                       :fingerprint   {:global {:distinct-count 285},
                                       :type   {:type/Number {:min 5.0, :max 2384.0, :avg 1000.2}}}}]
                     (db/select-one-field :result_metadata Card :name card-name))))))))))

(deftest saving-card-fetches-correct-metadata
  (testing "make sure when saving a Card the correct query metadata is fetched (if incorrect)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [metadata  [{:base_type     :type/BigInteger
                        :display_name  "Count Chocula"
                        :name          "count_chocula"
                        :semantic_type :type/Quantity}]
            card-name (mt/random-name)]
        (mt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [Card]
            (mt/user-http-request :rasta :post 202 "card"
                                  (assoc (card-with-name-and-query card-name)
                                         :collection_id      (u/the-id collection)
                                         :result_metadata    metadata
                                         ;; bad checksum
                                         :metadata_checksum  "ABCDEF"))
            (testing "check the correct metadata was fetched and was saved in the DB"
              (is (= [{:base_type     :type/BigInteger
                       :display_name  "Count"
                       :name          "count"
                       :semantic_type :type/Quantity
                       :source        :aggregation
                       :field_ref     [:aggregation 0]}]
                     (db/select-one-field :result_metadata Card :name card-name))))))))))

(deftest fetch-results-metadata-test
  (testing "Check that the generated query to fetch the query result metadata includes user information in the generated query"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [metadata  [{:base_type     :type/Integer
                        :display_name  "Count Chocula"
                        :name          "count_chocula"
                        :semantic_type :type/Quantity}]
            card-name (mt/random-name)]
        (mt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [Card]
            ;; Rebind the `execute-statement!` function so that we can capture the generated SQL and inspect it
            (let [orig       (var-get #'sql-jdbc.execute/execute-statement!)
                  sql-result (atom nil)]
              (with-redefs [sql-jdbc.execute/execute-statement!
                            (fn [driver stmt sql]
                              (reset! sql-result sql)
                              (orig driver stmt sql))]
                ;; create a card with the metadata
                (mt/user-http-request
                 :rasta :post 202 "card"
                 (assoc (card-with-name-and-query card-name)
                        :dataset_query      (mt/native-query {:query "SELECT count(*) AS \"count\" FROM VENUES"})
                        :collection_id      (u/the-id collection)
                        :result_metadata    metadata
                        :metadata_checksum  "ABCDEF"))) ; bad checksum
              (testing "check the correct metadata was fetched and was saved in the DB"
                (is (= [{:base_type     (count-base-type)
                         :display_name  "count"
                         :name          "count"
                         :semantic_type :type/Quantity
                         :fingerprint   {:global {:distinct-count 1
                                                  :nil%           0.0},
                                         :type   {:type/Number {:min 100.0, :max 100.0, :avg 100.0, :q1 100.0, :q3 100.0 :sd nil}}}
                         :field_ref     [:field "count" {:base-type (count-base-type)}]}]
                       (db/select-one-field :result_metadata Card :name card-name))))
              (testing "Was the user id found in the generated SQL?"
                (is (= true
                       (boolean
                        (when-let [s @sql-result]
                          (re-find (re-pattern (str "userID: " (mt/user->id :rasta)))
                                   s)))))))))))))

(deftest create-card-with-collection-position
  (testing "Make sure we can create a Card with a Collection position"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [card-name (mt/random-name)]
        (mt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [Card]
            (is (schema= {:collection_id       (s/eq (u/the-id collection))
                          :collection_position (s/eq 1)
                          :name                (s/eq card-name)
                          s/Keyword            s/Any}
                         (mt/user-http-request :rasta :post 202 "card"
                                               (assoc (card-with-name-and-query card-name)
                                                      :collection_id (u/the-id collection), :collection_position 1))))
            (is (schema= {:collection_id       (s/eq (u/the-id collection))
                          :collection_position (s/eq 1)
                          s/Keyword            s/Any}
                         (db/select-one Card :name card-name)))))))))

(deftest need-permission-for-collection
  (testing "You need to have Collection permissions to create a Card in a Collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [card-name (mt/random-name)]
        (mt/with-temp Collection [collection]
          (mt/with-model-cleanup [Card]
            (mt/user-http-request :rasta :post 403 "card"
                                  (assoc (card-with-name-and-query card-name)
                                         :collection_id (u/the-id collection)
                                         :collection_position 1))
            (is (nil? (some-> (db/select-one [Card :collection_id :collection_position] :name card-name)
                              (update :collection_id (partial = (u/the-id collection))))))))))))

(deftest create-card-check-adhoc-query-permissions-test
  (testing (str "Ad-hoc query perms should be required to save a Card -- otherwise people could save arbitrary "
                "queries, then run them.")
    ;; create a copy of the test data warehouse DB, then revoke permissions to it for All Users. Only admins should be
    ;; able to ad-hoc query it now.
    (mt/with-temp-copy-of-db
      (perms/revoke-permissions! (perms-group/all-users) (mt/db))
      (let [query        (mt/mbql-query :venues)
            create-card! (fn [test-user expected-status-code]
                           (mt/with-model-cleanup [Card]
                             (mt/user-http-request test-user :post expected-status-code "card"
                                                   (merge (mt/with-temp-defaults Card) {:dataset_query query}))))]
        (testing "admin should be able to save a Card if All Users doesn't have ad-hoc data perms"
          (is (some? (create-card! :crowberto 202))))
        (testing "non-admin should get an error"
          (testing "Permissions errors should be meaningful and include info for debugging (#14931)"
            (is (schema= {:message        (s/eq "You cannot save this Question because you do not have permissions to run its query.")
                          :query          (s/eq (mt/obj->json->obj query))
                          :required-perms [perms/ObjectPath]
                          :actual-perms   [perms/UserPath]
                          :trace          [s/Any]
                          s/Keyword       s/Any}
                         (create-card! :rasta 403)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            FETCHING A SPECIFIC CARD                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-card-test
  (testing "GET /api/card/:id"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [collection]
                      Card       [card {:collection_id (u/the-id collection)
                                        :dataset_query (mt/mbql-query venues)}]]
        (testing "You have to have Collection perms to fetch a Card"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "card/" (u/the-id card))))))

        (testing "Should be able to fetch the Card if you have Collection read perms"
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
                   :dataset_query          (mt/obj->json->obj (:dataset_query card))
                   :display                "table"
                   :query_type             "query"
                   :visualization_settings {}
                   :can_write              false
                   :database_id            (mt/id) ; these should be inferred from the dataset_query
                   :table_id               (mt/id :venues)
                   :collection_id          (u/the-id collection)
                   :collection             (into {} collection)
                   :result_metadata        (mt/obj->json->obj (:result_metadata card))})
                 (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card))))))
        (testing "Card should include last edit info if available"
          (mt/with-temp* [User     [{user-id :id} {:first_name "Test" :last_name "User" :email "user@test.com"}]
                          Revision [_ {:model "Card"
                                       :model_id (:id card)
                                       :user_id user-id
                                       :object (revision/serialize-instance card (:id card) card)}]]
            (is (= {:id true :email "user@test.com" :first_name "Test" :last_name "User" :timestamp true}
                   (-> (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card)))
                       mt/boolean-ids-and-timestamps
                       :last-edit-info)))))
        (testing "Card should include moderation reviews"
          (letfn [(clean [mr] (select-keys [mr] [:status :text])) ]
            (mt/with-temp* [ModerationReview [review {:moderated_item_id (:id card)
                                                      :moderated_item_type "card"
                                                      :moderator_id (mt/user->id :rasta)
                                                      :most_recent true
                                                      :status "verified"
                                                      :text "lookin good"}]]
              (is (= [(clean review)]
                     (->> (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card)))
                          mt/boolean-ids-and-timestamps
                          :moderation_reviews
                          (map clean)))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                UPDATING A CARD                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+


(deftest updating-a-card-that-doesnt-exist-should-give-a-404
  (is (= "Not found."
         (mt/user-http-request :crowberto :put 404 "card/12345"))))

(deftest test-that-we-can-edit-a-card
  (mt/with-temp Card [card {:name "Original Name"}]
    (with-cards-in-writeable-collection card
      (is (= "Original Name"
             (db/select-one-field :name Card, :id (u/the-id card))))
      (is (= {:timestamp true, :first_name "Rasta", :last_name "Toucan", :email "rasta@metabase.com", :id true}
             (-> (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:name "Updated Name"})
                 mt/boolean-ids-and-timestamps
                 :last-edit-info)))
      (is (= "Updated Name"
             (db/select-one-field :name Card, :id (u/the-id card)))))))

(deftest can-we-update-a-card-s-archived-status-
  (mt/with-temp Card [card]
    (with-cards-in-writeable-collection card
      (let [archived?     (fn [] (:archived (Card (u/the-id card))))
            set-archived! (fn [archived]
                            (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:archived archived})
                            (archived?))]
        (is (= false
               (archived?)))
        (is (= true
               (set-archived! true)))
        (is (= false
               (set-archived! false)))))))

(deftest we-shouldn-t-be-able-to-archive-cards-if-we-don-t-have-collection--write--perms
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [collection]
                    Card       [card {:collection_id (u/the-id collection)}]]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card)) {:archived true}))))))

(deftest we-shouldn-t-be-able-to-unarchive-cards-if-we-don-t-have-collection--write--perms
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [collection]
                    Card       [card {:collection_id (u/the-id collection) :archived true}]]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (is (= "You don't have permissions to do that."
              (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card)) {:archived false}))))))

(deftest clear-description-test
  (testing "Can we clear the description of a Card? (#4738)"
    (mt/with-temp Card [card {:description "What a nice Card"}]
      (with-cards-in-writeable-collection card
        (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:description nil})
        (is (nil? (db/select-one-field :description Card :id (u/the-id card))))))))

(deftest description-should-be-blankable-as-well
  (mt/with-temp Card [card {:description "What a nice Card"}]
    (with-cards-in-writeable-collection card
      (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:description ""})
      (is (= ""
             (db/select-one-field :description Card :id (u/the-id card)))))))

(deftest update-embedding-params-test
  (testing "PUT /api/card/:id"
    (mt/with-temp Card [card]
      (testing "If embedding is disabled, even an admin should not be allowed to update embedding params"
        (mt/with-temporary-setting-values [enable-embedding false]
          (is (= "Embedding is not enabled."
                 (mt/user-http-request :crowberto :put 400 (str "card/" (u/the-id card))
                                       {:embedding_params {:abc "enabled"}})))))

      (mt/with-temporary-setting-values [enable-embedding true]
        (testing "Non-admin should not be allowed to update Card's embedding parms"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card))
                                       {:embedding_params {:abc "enabled"}}))))

        (testing "Admin should be able to update Card's embedding params"
          (mt/user-http-request :crowberto :put 202 (str "card/" (u/the-id card))
                                {:embedding_params {:abc "enabled"}})
          (is (= {:abc "enabled"}
                 (db/select-one-field :embedding_params Card :id (u/the-id card)))))))))

(deftest make-sure-when-updating-a-card-the-query-metadata-is-saved--if-correct-
  (let [metadata [{:base_type    :type/Integer
                   :display_name "Count Chocula"
                   :name         "count_chocula"}]]
    (mt/with-temp Card [card]
      (with-cards-in-writeable-collection card
        ;; update the Card's query
        (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card))
                              {:dataset_query     (mbql-count-query)
                               :result_metadata   metadata
                               :metadata_checksum (#'results-metadata/metadata-checksum metadata)})
        ;; now check the metadata that was saved in the DB
        (is (= [{:base_type    :type/Integer
                 :display_name "Count Chocula"
                 :name         "count_chocula"}]
               (db/select-one-field :result_metadata Card :id (u/the-id card))))))))

(deftest make-sure-when-updating-a-card-the-correct-query-metadata-is-fetched--if-incorrect-
  (let [metadata [{:base_type     :type/BigInteger
                   :display_name  "Count Chocula"
                   :name          "count_chocula"
                   :semantic_type :type/Quantity}]]
    (mt/with-temp Card [card]
      (with-cards-in-writeable-collection card
        ;; update the Card's query
        (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card))
                              {:dataset_query     (mbql-count-query)
                               :result_metadata   metadata
                               :metadata_checksum "ABC123"}) ; invalid checksum
        ;; now check the metadata that was saved in the DB
        (is (= [{:base_type     :type/BigInteger
                 :display_name  "Count"
                 :name          "count"
                 :semantic_type :type/Quantity
                 :source        :aggregation
                 :field_ref     [:aggregation 0]}]
               (db/select-one-field :result_metadata Card :id (u/the-id card))))))))

(deftest can-we-change-the-collection-position-of-a-card-
  (mt/with-temp Card [card]
    (with-cards-in-writeable-collection card
      (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card))
                            {:collection_position 1})
      (is (= 1
             (db/select-one-field :collection_position Card :id (u/the-id card)))))))

(deftest ---and-unset--unpin--it-as-well-
  (mt/with-temp Card [card {:collection_position 1}]
    (with-cards-in-writeable-collection card
      (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card))
                            {:collection_position nil})
      (is (= nil
             (db/select-one-field :collection_position Card :id (u/the-id card)))))))

(deftest ---we-shouldn-t-be-able-to-if-we-don-t-have-permissions-for-the-collection
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [collection]
                    Card       [card {:collection_id (u/the-id collection)}]]
      (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card))
                            {:collection_position 1})
      (is (= nil
             (db/select-one-field :collection_position Card :id (u/the-id card)))))))

(deftest gets-a-card
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [collection]
                    Card       [card {:collection_id (u/the-id collection), :collection_position 1}]]
      (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card))
                            {:collection_position nil})
      (is (= 1
             (db/select-one-field :collection_position Card :id (u/the-id card)))))))


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
  (name->position (:data (mt/user-http-request user-kwd :get 200
                                               (format "collection/%s/items" (u/the-id collection-or-collection-id))))))

(defmacro with-ordered-items
  "Macro for creating many sequetial collection_position model instances, putting each in `collection`"
  [collection model-and-name-syms & body]
  `(mt/with-temp* ~(vec (mapcat (fn [idx [model-instance name-sym]]
                                  [model-instance [name-sym {:name                (name name-sym)
                                                             :collection_id       `(u/the-id ~collection)
                                                             :collection_position idx}]])
                                (iterate inc 1)
                                (partition-all 2 model-and-name-syms)))
     (testing (format "\nWith ordered items in Collection %d: %s"
                      (u/the-id ~collection)
                      ~(str/join ", " (for [[model symb] (partition-all 2 model-and-name-syms)]
                                        (format "%s %s" (name model) (name symb)))))
       ~@body)))

(deftest check-to-make-sure-we-can-move-a-card-in-a-collection-of-just-cards
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp Collection [collection]
      (with-ordered-items collection [Card a
                                      Card b
                                      Card c
                                      Card d]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id c))
                              {:collection_position 1})
        (is (= {"c" 1
                "a" 2
                "b" 3
                "d" 4}
               (get-name->collection-position :rasta collection)))))))

(deftest add-new-card-update-positions-test
  (testing "POST /api/card"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (doseq [{:keys [message position expected]}
                [{:message  (str "Add a new card to an existing collection at position 1, will cause all existing "
                                 "positions to increment by 1")
                  :position 1
                  :expected {"d" 1
                             "a" 2
                             "b" 3
                             "c" 4}}
                 {:message  "Add new card in the middle, should only increment positions of objects that come after"
                  :position 2
                  :expected {"a" 1
                             "d" 2
                             "b" 3
                             "c" 4}}
                 {:message  "Add new card to end, shouldn't affect positions of other objects"
                  :position 4
                  :expected {"a" 1
                             "b" 2
                             "c" 3
                             "d" 4}}
                 {:message  (str "When adding a new Card to a Collection that does not have a position, it should not "
                                 "change positions of other objects")
                  :position nil
                  :expected {"a" 1
                             "b" 2
                             "c" 3
                             "d" nil}}]]
          (testing (str "\n" message)
            (with-ordered-items collection [Dashboard a
                                            Pulse     b
                                            Card      c]
              (testing "Original collection, before adding the new card"
                (is (= {"a" 1
                        "b" 2
                        "c" 3}
                       (get-name->collection-position :rasta collection))))
              (mt/with-model-cleanup [Card]
                (mt/user-http-request :rasta :post 202 "card"
                                      (merge (card-with-name-and-query "d")
                                             {:collection_id       (u/the-id collection)
                                              :collection_position position}))
                (is (= expected
                       (get-name->collection-position :rasta collection)))))))))))

(deftest move-existing-card-update-positions-test
  (testing "PUT /api/card/:id"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (doseq [{:keys [message position expected]}
                [{:message  "Move existing Card to front"
                  :position 1
                  :expected {"d" 1
                             "a" 2
                             "b" 3
                             "c" 4
                             "e" 5
                             "f" 6}}
                 {:message  "Move existing Card to end"
                  :position 6
                  :expected {"a" 1
                             "b" 2
                             "c" 3
                             "e" 4
                             "f" 5
                             "d" 6}}
                 {:message  (str "When setting Collection position to nil, positions of other things should be adjusted "
                                 "accordingly")
                  :position nil
                  :expected {"a" 1
                             "b" 2
                             "c" 3
                             "e" 4
                             "f" 5
                             "d" nil}}]]
          (testing (str "\n" message)
            (with-ordered-items collection [Dashboard a
                                            Dashboard b
                                            Card      c
                                            Card      d
                                            Pulse     e
                                            Pulse     f]
              (testing "Original collection, before moving the Card"
                (is (= {"a" 1
                        "b" 2
                        "c" 3
                        "d" 4
                        "e" 5
                        "f" 6}
                       (get-name->collection-position :rasta collection))))
              (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id d))
                                    {:collection_position position, :collection_id (u/the-id collection)})
              (is (= expected
                     (get-name->collection-position :rasta collection))))))))))

(deftest give-existing-card-a-position-test
  (testing "Give an existing Card without a `:collection_position` a position, and things should be adjusted accordingly"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [{coll-id :id :as collection}]
                      Card       [_ {:name "a", :collection_id coll-id, :collection_position 1}]
                      ;; Card b does not start with a collection_position
                      Card       [b {:name "b", :collection_id coll-id}]
                      Dashboard  [_ {:name "c", :collection_id coll-id, :collection_position 2}]
                      Card       [_ {:name "d", :collection_id coll-id, :collection_position 3}]]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id b))
                              {:collection_position 2})
        (is (= {"a" 1
                "b" 2
                "c" 3
                "d" 4}
               (get-name->collection-position :rasta coll-id)))))))

(deftest change-collections-update-positions-test
  (testing (str "Change the Collection the Card is in, leave the position, should cause old and new collection to have "
                "their positions updated")
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [collection-1]
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
            (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id f))
                                  {:collection_id (u/the-id collection-1)})
            (testing "Dest collection should get updated positions"
              (is (= {"a" 1
                      "f" 2
                      "b" 3
                      "c" 4
                      "d" 5}
                     (get-name->collection-position :rasta collection-1))))
            (testing "Original collection should get updated positions"
              (is (= {"e" 1
                      "g" 2
                      "h" 3}
                     (get-name->collection-position :rasta collection-2))))))))))

(deftest change-both-collection-and-position-test
  (testing "Change the collection and the position, causing both collections and the updated card to have their order changed"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [collection-1]
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
            (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id h))
                                  {:collection_position 1, :collection_id (u/the-id collection-1)})
            (is (= {"h" 1
                    "a" 2
                    "b" 3
                    "c" 4
                    "d" 5}
                   (get-name->collection-position :rasta collection-1)))
            (is (= {"e" 1
                    "f" 2
                    "g" 3}
                   (get-name->collection-position :rasta collection-2)))))))))

(deftest update-card-check-adhoc-query-permissions-test
  (testing (str "Ad-hoc query perms should be required to update the query for a Card -- otherwise people could save "
                "arbitrary queries, then run them.")
    ;; create a copy of the test data warehouse DB, then revoke permissions to it for All Users. Only admins should be
    ;; able to ad-hoc query it now.
    (mt/with-temp-copy-of-db
      (perms/revoke-permissions! (perms-group/all-users) (mt/db))
      (mt/with-temp Card [{card-id :id} {:dataset_query (mt/mbql-query :venues)}]
        (let [update-card! (fn [test-user expected-status-code request-body]
                             (mt/user-http-request test-user :put expected-status-code (format "card/%d" card-id)
                                                   request-body))]
          (testing "\nadmin"
            (testing "*should* be allowed to update query"
              (is (schema= {:id            (s/eq card-id)
                            :dataset_query (s/eq (mt/obj->json->obj (mt/mbql-query :checkins)))
                            s/Keyword      s/Any}
                           (update-card! :crowberto 202 {:dataset_query (mt/mbql-query :checkins)})))))

          (testing "\nnon-admin"
            (testing "should be allowed to update fields besides query"
              (is (schema= {:id       (s/eq card-id)
                            :name     (s/eq "Updated name")
                            s/Keyword s/Any}
                           (update-card! :rasta 202 {:name "Updated name"}))))

            (testing "should *not* be allowed to update query"
              (testing "Permissions errors should be meaningful and include info for debugging (#14931)"
                (is (schema= {:message        (s/eq "You cannot save this Question because you do not have permissions to run its query.")
                              :query          (s/eq (mt/obj->json->obj (mt/mbql-query :users)))
                              :required-perms [perms/ObjectPath]
                              :actual-perms   [perms/UserPath]
                              :trace          [s/Any]
                              s/Keyword       s/Any}
                             (update-card! :rasta 403 {:dataset_query (mt/mbql-query :users)}))))
              (testing "make sure query hasn't changed in the DB"
                (is (= (mt/mbql-query checkins)
                       (db/select-one-field :dataset_query Card :id card-id)))))

            (testing "should be allowed to update other fields if query is passed in but hasn't changed (##11719)"
              (is (schema= {:id            (s/eq card-id)
                            :name          (s/eq "Another new name")
                            :dataset_query (s/eq (mt/obj->json->obj (mt/mbql-query :checkins)))
                            s/Keyword      s/Any}
                           (update-card! :rasta 202 {:name "Another new name", :dataset_query (mt/mbql-query checkins)}))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Card updates that impact alerts                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- rasta-alert-not-working [body-map]
  (mt/email-to :rasta {:subject "One of your alerts has stopped working"
                       :body    body-map}))

(defn- crowberto-alert-not-working [body-map]
  (mt/email-to :crowberto {:subject "One of your alerts has stopped working"
                           :body    body-map}))

(deftest alert-deletion-test
  (doseq [{:keys [message card expected-email f]}
          [{:message        "Archiving a Card should trigger Alert deletion"
            :expected-email "the question was archived by Rasta Toucan"
            :f              (fn [{:keys [card]}]
                              (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:archived true}))}
           {:message        "Validate changing a display type triggers alert deletion"
            :card           {:display :table}
            :expected-email "the question was edited by Rasta Toucan"
            :f              (fn [{:keys [card]}]
                              (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:display :line}))}
           {:message        "Changing the display type from line to table should force a delete"
            :card           {:display :line}
            :expected-email "the question was edited by Rasta Toucan"
            :f              (fn [{:keys [card]}]
                              (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:display :table}))}
           {:message        "Removing the goal value will trigger the alert to be deleted"
            :card           {:display                :line
                             :visualization_settings {:graph.goal_value 10}}
            :expected-email "the question was edited by Rasta Toucan"
            :f              (fn [{:keys [card]}]
                              (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:visualization_settings {:something "else"}}))}
           {:message        "Adding an additional breakout will cause the alert to be removed"
            :card           {:display                :line
                             :visualization_settings {:graph.goal_value 10}
                             :dataset_query          (assoc-in
                                                      (mbql-count-query (mt/id) (mt/id :checkins))
                                                      [:query :breakout]
                                                      [[:field
                                                        (mt/id :checkins :date)
                                                        {:temporal-unit :hour}]])}
            :expected-email "the question was edited by Crowberto Corv"
            :f              (fn [{:keys [card]}]
                              (mt/user-http-request :crowberto :put 202 (str "card/" (u/the-id card))
                                                    {:dataset_query (assoc-in (mbql-count-query (mt/id) (mt/id :checkins))
                                                                              [:query :breakout] [[:datetime-field (mt/id :checkins :date) "hour"]
                                                                                                  [:datetime-field (mt/id :checkins :date) "minute"]])}))}]]
    (testing message
      (mt/with-temp* [Card                  [card  card]
                      Pulse                 [pulse {:alert_condition  "rows"
                                                    :alert_first_only false
                                                    :creator_id       (mt/user->id :rasta)
                                                    :name             "Original Alert Name"}]

                      PulseCard             [_     {:pulse_id (u/the-id pulse)
                                                    :card_id  (u/the-id card)
                                                    :position 0}]
                      PulseChannel          [pc    {:pulse_id (u/the-id pulse)}]
                      PulseChannelRecipient [_     {:user_id          (mt/user->id :crowberto)
                                                    :pulse_channel_id (u/the-id pc)}]
                      PulseChannelRecipient [_     {:user_id          (mt/user->id :rasta)
                                                    :pulse_channel_id (u/the-id pc)}]]
        (with-cards-in-writeable-collection card
          (mt/with-fake-inbox
            (u/with-timeout 5000
              (mt/with-expected-messages 2
                (f {:card card})))
            (is (= (merge (crowberto-alert-not-working {expected-email true})
                          (rasta-alert-not-working     {expected-email true}))
                   (mt/regex-email-bodies (re-pattern expected-email)))
                (format "Email containing %s should have been sent to Crowberto and Rasta" (pr-str expected-email)))
            (is (= nil
                   (Pulse (u/the-id pulse)))
                "Alert should have been deleted")))))))

(deftest changing-the-display-type-from-line-to-area-bar-is-fine-and-doesnt-delete-the-alert
  (is (= {:emails-1 {}
          :pulse-1  true
          :emails-2 {}
          :pulse-2  true}
         (mt/with-temp* [Card                  [card  {:display                :line
                                                       :visualization_settings {:graph.goal_value 10}}]
                         Pulse                 [pulse {:alert_condition  "goal"
                                                       :alert_first_only false
                                                       :creator_id       (mt/user->id :rasta)
                                                       :name             "Original Alert Name"}]
                         PulseCard             [_     {:pulse_id (u/the-id pulse)
                                                       :card_id  (u/the-id card)
                                                       :position 0}]
                         PulseChannel          [pc    {:pulse_id (u/the-id pulse)}]
                         PulseChannelRecipient [_     {:user_id          (mt/user->id :rasta)
                                                       :pulse_channel_id (u/the-id pc)}]]
           (with-cards-in-writeable-collection card
             (mt/with-fake-inbox
               (array-map
                :emails-1 (do
                            (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:display :area})
                            (mt/regex-email-bodies #"the question was edited by Rasta Toucan"))
                :pulse-1  (boolean (Pulse (u/the-id pulse)))
                :emails-2 (do
                            (mt/user-http-request :rasta :put 202 (str "card/" (u/the-id card)) {:display :bar})
                            (mt/regex-email-bodies #"the question was edited by Rasta Toucan"))
                :pulse-2  (boolean (Pulse (u/the-id pulse))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DELETING A CARD (DEPRECATED)                                          |
;;; +----------------------------------------------------------------------------------------------------------------+
;; Deprecated because you're not supposed to delete cards anymore. Archive them instead

(deftest check-that-we-can-delete-a-card
  (is (nil? (mt/with-temp Card [card]
              (with-cards-in-writeable-collection card
                (mt/user-http-request :rasta :delete 204 (str "card/" (u/the-id card)))
                (Card (u/the-id card)))))))

;; deleting a card that doesn't exist should return a 404 (#1957)
(deftest deleting-a-card-that-doesnt-exist-should-return-a-404---1957-
  (is (= "Not found."
         (mt/user-http-request :crowberto :delete 404 "card/12345"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   FAVORITING                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Helper Functions
(defn- fave? [card]
  (db/exists? CardFavorite, :card_id (u/the-id card), :owner_id (mt/user->id :rasta)))

(defn- fave! [card]
  (mt/user-http-request :rasta :post 200 (format "card/%d/favorite" (u/the-id card))))

(defn- unfave! [card]
  (mt/user-http-request :rasta :delete 204 (format "card/%d/favorite" (u/the-id card))))

;; ## GET /api/card/:id/favorite
(deftest can-we-see-if-a-card-is-a-favorite--
  (is (= false
         (mt/with-temp Card [card]
           (with-cards-in-readable-collection card
             (fave? card))))))

(deftest favorite-test
  (testing "Can we favorite a Card?"
    (testing "POST /api/card/:id/favorite"
      (mt/with-temp Card [card]
        (with-cards-in-readable-collection card
          (is (= false
                 (fave? card)))
          (fave! card)
          (is (= true
                 (fave? card))))))))

(deftest unfavorite-test
  (testing "Can we unfavorite a Card?"
    (testing "DELETE /api/card/:id/favorite"
      (mt/with-temp Card [card]
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
                (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv"
                                                               (u/the-id card)))))))))
  (testing "with-paramters"
    (with-temp-native-card-with-params [_ card]
      (with-cards-in-readable-collection card
        (is (= ["COUNT(*)"
                "8"]
               (str/split-lines
                (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv?parameters=%s"
                                                               (u/the-id card) encoded-params)))))))))

(deftest json-download-test
  (testing "no parameters"
    (with-temp-native-card [_ card]
      (with-cards-in-readable-collection card
        (is (= [{(keyword "COUNT(*)") 75}]
               (mt/user-http-request :rasta :post 200 (format "card/%d/query/json" (u/the-id card))))))))
  (testing "with parameters"
    (with-temp-native-card-with-params [_ card]
      (with-cards-in-readable-collection card
        (is (= [{(keyword "COUNT(*)") 8}]
               (mt/user-http-request :rasta :post 200 (format "card/%d/query/json?parameters=%s"
                                                              (u/the-id card) encoded-params))))))))

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
                (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                      {:request-options {:as :byte-array}})))))))
  (testing "with parameters"
    (with-temp-native-card-with-params [_ card]
      (with-cards-in-readable-collection card
        (is (= [{:col "COUNT(*)"} {:col 8.0}]
               (parse-xlsx-results
                (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx?parameters=%s"
                                                               (u/the-id card) encoded-params)
                                      {:request-options {:as :byte-array}}))))))))

(deftest download-default-constraints-test
  (mt/with-temp Card [card {:dataset_query {:database   (mt/id)
                                            :type       :query
                                            :query      {:source-table (mt/id :venues)}
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
                   (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv" (u/the-id card))))))
          (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
            (testing (str "Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints -- even "
                          "if the query comes in with `add-default-userland-constraints` (as will be the case if the query "
                          "gets saved from one that had it -- see #9831)")
              (is (= {:constraints nil}
                     (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv" (u/the-id card))))))

            (testing (str "non-\"download\" queries should still get the default constraints (this also is a sanitiy "
                          "check to make sure the `with-redefs` in the test above actually works)")
              (is (= {:constraints {:max-results 10, :max-results-bare-rows 10}}
                     (mt/user-http-request :rasta :post 200 (format "card/%d/query" (u/the-id card))))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  COLLECTIONS                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest make-sure-we-can-create-a-card-and-specify-its--collection-id--at-the-same-time
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp Collection [collection]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (mt/with-model-cleanup [Card]
        (let [card (mt/user-http-request :rasta :post 202 "card"
                                         (assoc (card-with-name-and-query)
                                                :collection_id (u/the-id collection)))]
          (is (= (db/select-one-field :collection_id Card :id (u/the-id card))
                 (u/the-id collection))))))))

(deftest make-sure-we-card-creation-fails-if-we-try-to-set-a--collection-id--we-don-t-have-permissions-for
  (testing "POST /api/card"
    (testing "You must have permissions for the parent Collection to create a new Card in it"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (mt/with-model-cleanup [Card]
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "card"
                                         (assoc (card-with-name-and-query) :collection_id (u/the-id collection)))))))))))

(deftest set-card-collection-id-test
  (testing "Should be able to set the Collection ID of a Card in the Root Collection (i.e., `collection_id` is nil)"
    (mt/with-temp* [Card       [card]
                    Collection [collection]]
      (mt/user-http-request :crowberto :put 202 (str "card/" (u/the-id card)) {:collection_id (u/the-id collection)})
      (is (= (db/select-one-field :collection_id Card :id (u/the-id card))
             (u/the-id collection))))))

(deftest update-card-require-parent-perms-test
  (testing "Should require perms for the parent collection to change a Card's properties"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [collection]
                      Card       [card       {:collection_id (u/the-id collection)}]]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card))
                                     {:name "Number of Blueberries Consumed Per Month"})))))))

(deftest change-collection-permissions-test
  (testing "PUT /api/card/:id"
    (testing "\nChange the `collection_id` of a Card"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [original-collection]
                        Collection [new-collection]
                        Card       [card                {:collection_id (u/the-id original-collection)}]]
          (letfn [(change-collection! [expected-status-code]
                    (mt/user-http-request :rasta :put expected-status-code (str "card/" (u/the-id card))
                                          {:collection_id (u/the-id new-collection)}))]
            (testing "requires write permissions for the new Collection"
              (is (= "You don't have permissions to do that."
                     (change-collection! 403))))

            (testing "requires write permissions for the current Collection"
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
              (is (= "You don't have permissions to do that."
                     (change-collection! 403))))

            (testing "Should be able to change it once you have perms for both collections"
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) original-collection)
              (change-collection! 202)
              (is (= (db/select-one-field :collection_id Card :id (u/the-id card))
                     (u/the-id new-collection))))))))))


;;; ------------------------------ Bulk Collections Update (POST /api/card/collections) ------------------------------

(defn- collection-names
  "Given a sequences of `cards-or-card-ids`, return a corresponding sequence of names of the Collection each Card is
  in."
  [cards-or-card-ids]
  (when (seq cards-or-card-ids)
    (let [cards               (db/select [Card :collection_id] :id [:in (map u/the-id cards-or-card-ids)])
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
   (mt/user-http-request username :post expected-status-code "card/collections"
                         {:collection_id (when collection-or-collection-id-or-nil
                                           (u/the-id collection-or-collection-id-or-nil))
                          :card_ids      (map u/the-id cards-or-card-ids)})

   :collections
   (collection-names cards-or-card-ids)))

(deftest test-that-we-can-bulk-move-some-cards-with-no-collection-into-a-collection
  (mt/with-temp* [Collection [collection {:name "Pog Collection"}]
                  Card       [card-1]
                  Card       [card-2]]
    (is (= {:response    {:status "ok"}
            :collections ["Pog Collection"
                          "Pog Collection"]}
           (POST-card-collections! :crowberto 200 collection [card-1 card-2])))))

(deftest test-that-we-can-bulk-move-some-cards-from-one-collection-to-another
  (mt/with-temp* [Collection [old-collection {:name "Old Collection"}]
                  Collection [new-collection {:name "New Collection"}]
                  Card       [card-1         {:collection_id (u/the-id old-collection)}]
                  Card       [card-2         {:collection_id (u/the-id old-collection)}]]
    (is (= {:response    {:status "ok"}
            :collections ["New Collection" "New Collection"]}
           (POST-card-collections! :crowberto 200 new-collection [card-1 card-2])))))

(deftest test-that-we-can-bulk-remove-some-cards-from-a-collection
  (mt/with-temp* [Collection [collection]
                  Card       [card-1     {:collection_id (u/the-id collection)}]
                  Card       [card-2     {:collection_id (u/the-id collection)}]]
    (is (= {:response    {:status "ok"}
            :collections [nil nil]}
           (POST-card-collections! :crowberto 200 nil [card-1 card-2])))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-destination-collection
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [collection]
                    Card       [card-1]
                    Card       [card-2]]
      (is (= {:response    "You don't have permissions to do that."
              :collections [nil nil]}
             (POST-card-collections! :rasta 403 collection [card-1 card-2]))))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-source-collection
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [collection {:name "Horseshoe Collection"}]
                    Card       [card-1     {:collection_id (u/the-id collection)}]
                    Card       [card-2     {:collection_id (u/the-id collection)}]]
      (is (= {:response    "You don't have permissions to do that."
              :collections ["Horseshoe Collection" "Horseshoe Collection"]}
             (POST-card-collections! :rasta 403 nil [card-1 card-2]))))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-the-card
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [collection]
                    Database   [database]
                    Table      [table      {:db_id (u/the-id database)}]
                    Card       [card-1     {:dataset_query (mbql-count-query (u/the-id database) (u/the-id table))}]
                    Card       [card-2     {:dataset_query (mbql-count-query (u/the-id database) (u/the-id table))}]]
      (perms/revoke-permissions! (perms-group/all-users) (u/the-id database))
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (is (= {:response    "You don't have permissions to do that."
              :collections [nil nil]}
             (POST-card-collections! :rasta 403 collection [card-1 card-2]))))))

;; Test that we can bulk move some Cards from one collection to another, while updating the collection position of the
;; old collection and the new collection
(deftest bulk-move-cards
  (mt/with-temp* [Collection [{coll-id-1 :id}      {:name "Old Collection"}]
                  Collection [{coll-id-2 :id
                               :as new-collection} {:name "New Collection"}]
                  Card       [card-a               {:name "a", :collection_id coll-id-1, :collection_position 1}]
                  Card       [card-b               {:name "b", :collection_id coll-id-1, :collection_position 2}]
                  Card       [card-c               {:name "c", :collection_id coll-id-1, :collection_position 3}]
                  Card       [card-d               {:name "d", :collection_id coll-id-2, :collection_position 1}]
                  Card       [card-e               {:name "e", :collection_id coll-id-2, :collection_position 2}]
                  Card       [card-f               {:name "f", :collection_id coll-id-2, :collection_position 3}]]
    (is (= {:response    {:status "ok"}
            :collections ["New Collection" "New Collection"]}
           (POST-card-collections! :crowberto 200 new-collection [card-a card-b])))
    (is (= {"a" 4                       ;-> Moved to the new collection, gets the first slot available
            "b" 5
            "c" 1                       ;-> With a and b no longer in the collection, c is first
            "d" 1                       ;-> Existing cards in new collection are untouched and position unchanged
            "e" 2
            "f" 3}
           (merge (name->position (:data (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id-1)
                                                               :model "card" :archived "false")))
                  (name->position (:data (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id-2)
                                                               :model "card" :archived "false"))))))))

(deftest moving-a-card-without-a-collection-position-keeps-the-collection-position-nil
  (mt/with-temp* [Collection [{coll-id-1 :id}      {:name "Old Collection"}]
                  Collection [{coll-id-2 :id
                               :as new-collection} {:name "New Collection"}]
                  Card       [card-a               {:name "a", :collection_id coll-id-1}]
                  Card       [card-b               {:name "b", :collection_id coll-id-2, :collection_position 1}]
                  Card       [card-c               {:name "c", :collection_id coll-id-2, :collection_position 2}]]
    (is (= {:response    {:status "ok"}
            :collections ["New Collection" "New Collection"]}
           (POST-card-collections! :crowberto 200 new-collection [card-a card-b])))
    (is (= {"a" nil
            "b" 1
            "c" 2}
           (merge (name->position (:data (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id-1)
                                                               :model "card" :archived "false")))
                  (name->position (:data (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id-2)
                                                               :model "card" :archived "false"))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- shared-card []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

(deftest share-card-test
  (testing "POST /api/card/:id/public_link"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp Card [card]
        (let [{uuid :uuid} (mt/user-http-request :crowberto :post 200 (format "card/%d/public_link" (u/the-id card)))]
          (is (= true
                 (boolean (db/exists? Card :id (u/the-id card), :public_uuid uuid)))))))))

(deftest share-card-preconditions-test
  (testing "POST /api/card/:id/public_link"
    (testing "Public sharing has to be enabled to share a Card"
      (mt/with-temporary-setting-values [enable-public-sharing false]
        (mt/with-temp Card [card]
          (is (= "Public sharing is not enabled."
                 (mt/user-http-request :crowberto :post 400 (format "card/%d/public_link" (u/the-id card))))))))

    (mt/with-temporary-setting-values [enable-public-sharing true]
      (testing "Have to be an admin to share a Card"
        (mt/with-temp Card [card]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 (format "card/%d/public_link" (u/the-id card)))))))

      (testing "Cannot share an archived Card"
        (mt/with-temp Card [card {:archived true}]
          (is (schema= {:message    (s/eq "The object has been archived.")
                        :error_code (s/eq "archived")
                        s/Keyword   s/Any}
                       (mt/user-http-request :crowberto :post 404 (format "card/%d/public_link" (u/the-id card)))))))

      (testing "Cannot share a Card that doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :post 404 (format "card/%d/public_link" Integer/MAX_VALUE))))))))

(deftest share-already-shared-card-test
  (testing "POST /api/card/:id/public_link"
    (testing "Attempting to share a Card that's already shared should return the existing public UUID"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp Card [card (shared-card)]
          (is (= (:public_uuid card)
                 (:uuid (mt/user-http-request :crowberto :post 200 (format
                                                                    "card/%d/public_link"
                                                                    (u/the-id card)))))))))))

(deftest unshare-card-test
  (testing "DELETE /api/card/:id/public_link"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp Card [card (shared-card)]
        (mt/user-http-request :crowberto :delete 204 (format "card/%d/public_link" (u/the-id card)))
        (is (= false
               (db/exists? Card :id (u/the-id card), :public_uuid (:public_uuid card))))))))

(deftest unshare-card-preconditions-test
  (testing "DELETE /api/card/:id/public_link\n"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (testing "Endpoint should return 404 if Card isn't shared"
        (mt/with-temp Card [card]
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404 (format "card/%d/public_link" (u/the-id card)))))))

      (testing "You have to be an admin to unshare a Card"
        (mt/with-temp Card [card (shared-card)]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 (format "card/%d/public_link" (u/the-id card)))))))

      (testing "Endpoint should 404 if Card doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :delete 404 (format "card/%d/public_link" Integer/MAX_VALUE))))))))

(deftest test-that-we-can-fetch-a-list-of-publicly-accessible-cards
  (testing "GET /api/card/public"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp Card [card (shared-card)]
        (is (= [{:name true, :id true, :public_uuid true}]
               (for [card (mt/user-http-request :crowberto :get 200 "card/public")]
                 (m/map-vals boolean (select-keys card [:name :id :public_uuid])))))))))

(deftest test-that-we-can-fetch-a-list-of-embeddable-cards
  (testing "GET /api/card/embeddable"
    (mt/with-temporary-setting-values [enable-embedding true]
      (mt/with-temp Card [card {:enable_embedding true}]
        (is (= [{:name true, :id true}]
               (for [card (mt/user-http-request :crowberto :get 200 "card/embeddable")]
                 (m/map-vals boolean (select-keys card [:name :id])))))))))

(deftest test-related-recommended-entities
  (mt/with-temp Card [card]
    (is (schema= {:table             s/Any
                  :metrics           s/Any
                  :segments          s/Any
                  :dashboard-mates   s/Any
                  :similar-questions s/Any
                  :canonical-metric  s/Any
                  :dashboards        s/Any
                  :collections       s/Any}
                 (mt/user-http-request :crowberto :get 200 (format "card/%s/related" (u/the-id card)))))))

(deftest pivot-card-test
  (mt/test-drivers pivots/applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/card/pivot/:card-id/query"
        (mt/with-temp Card [card (pivots/pivot-card)]
          (let [result (mt/user-http-request :rasta :post 202 (format "card/pivot/%d/query" (u/the-id card)))
                rows   (mt/rows result)]
            (is (= 1144 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))

            (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
            (is (= ["MS" "Organic" "Gizmo" 0 16 42] (nth rows 445)))
            (is (= [nil nil nil 7 18760 69540] (last rows)))))))))
