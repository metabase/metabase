(ns metabase-enterprise.advanced-permissions.query-processor.middleware.permissions-test
  (:require
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.query-processor.middleware.permissions :as ee.qp.perms]
   [metabase-enterprise.sandbox.query-processor.middleware.sandboxing :as sandboxing]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.query-processor.api :as api.dataset]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.streaming-test :as streaming-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- do-with-download-perms!
  [db-or-id graph f]
  (let [all-users-group-id (u/the-id (perms/all-users-group))
        db-id              (u/the-id db-or-id)
        revision           (:revision (data-perms.graph/api-graph))]
    (mt/with-additional-premium-features #{:advanced-permissions}
      (perms.test-util/with-restored-data-perms!
        (data-perms.graph/update-data-perms-graph! {:revision revision
                                                    :groups   {all-users-group-id {db-id {:download graph}}}})
        (f)))))

(defn- remove-metadata [m]
  (lib.util.match/replace m
    (_ :guard (every-pred map? :source-metadata))
    (remove-metadata (dissoc &match :source-metadata))))

(mu/defn- apply-row-level-permissions [query :- ::lib.schema/query]
  (-> (#'sandboxing/apply-sandboxing query)
      remove-metadata))

(defmacro ^:private with-download-perms!
  "Runs `f` with the download perms for `db-or-id` set to the values in `graph` for the All Users permissions group."
  [db-or-id graph & body]
  `(do-with-download-perms! ~db-or-id ~graph (fn [] ~@body)))

(defn- do-with-download-perms-for-db!
  [db-or-id value f]
  (do-with-download-perms! db-or-id {:schemas value} f))

(defmacro ^:private with-download-perms-for-db!
  "Runs `body` with the download perms for `db-or-id` set to `value` for the All Users permissions group."
  [db-or-id value & body]
  `(do-with-download-perms-for-db! ~db-or-id ~value (fn [] ~@body)))

(defn- mbql-download-query
  ([]
   (mbql-download-query :venues))

  ([table-name]
   (lib/query
    (mt/metadata-provider)
    {:database (mt/id)
     :type     :query
     :query    {:source-table (mt/id table-name)}
     :info     {:context (api.dataset/export-format->context :csv)}})))

(defn- native-download-query []
  (lib/query
   (mt/metadata-provider)
   {:database (mt/id)
    :type     :native
    :native   {:query "select * from venues"}
    :info     {:context (api.dataset/export-format->context :csv)}}))

(defn- download-limit
  [query]
  (-> (if (:lib/type query)
        query
        (lib/query (mt/metadata-provider) query))
      ee.qp.perms/apply-download-limit
      lib/current-limit))

(deftest apply-download-limit-test
  (let [limited-download-max-rows @#'ee.qp.perms/max-rows-in-limited-downloads]
    (with-download-perms-for-db! (mt/id) :limited
      (mt/with-current-user (mt/user->id :rasta)
        (testing "A limit is added to MBQL queries if the user has limited download permissions for the DB"
          (is (= limited-download-max-rows
                 (download-limit (mbql-download-query)))))

        (testing "If the query already has a limit lower than the download limit, the limit is not changed"
          (is (= (dec limited-download-max-rows)
                 (download-limit (lib/limit (mbql-download-query) (dec limited-download-max-rows))))))

        (testing "Native queries are unmodified"
          (is (= (native-download-query) (ee.qp.perms/apply-download-limit (native-download-query))))))

      (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues) :limited
                                                         (mt/id :checkins) :full}}}
        (mt/with-current-user (mt/user->id :rasta)
          (testing "A limit is added to MBQL queries if the user has limited download permissions for a table which
                     the query references"
            (is (= limited-download-max-rows
                   (download-limit (mbql-download-query)))))

          (testing "If the query does not reference the table, a limit is not added"
            (is (nil? (download-limit (mbql-download-query 'checkins))))))))))

;; Inspired by the similar middleware wrapper [[metabase.query-processor.middleware.limit-test/limit]]
(defn- limit-download-result-rows [query]
  (let [rff (ee.qp.perms/limit-download-result-rows query qp.reducible/default-rff)
        rf  (rff {})]
    (transduce identity rf (repeat (inc @#'ee.qp.perms/max-rows-in-limited-downloads) [:ok]))))

(deftest limit-download-result-rows-test
  (let [limited-download-max-rows @#'ee.qp.perms/max-rows-in-limited-downloads]
    (with-download-perms-for-db! (mt/id) :limited
      (mt/with-current-user (mt/user->id :rasta)
        (testing "The number of rows in a native query result is limited if the user has limited download permissions"
          (is (= limited-download-max-rows
                 (-> (native-download-query) limit-download-result-rows mt/rows count))))))

    (with-download-perms-for-db! (mt/id) :full
      (mt/with-current-user (mt/user->id :rasta)
        (testing "The number of rows in a native query result is not limited if the user has full download permissions"
          (is (= (inc limited-download-max-rows)
                 (-> (native-download-query) limit-download-result-rows mt/rows count))))))))

(defn- check-download-permissions [query]
  (let [qp (ee.qp.perms/check-download-permissions
            (fn [query _rff]
              query))]
    (qp query qp.reducible/default-rff)))

(def ^:private download-perms-error-msg #"You do not have permissions to download the results of this query\.")

(deftest check-download-permissions-test
  (testing "An exception is thrown if the user does not have download permissions for the DB"
    (with-download-perms-for-db! (mt/id) :none
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg?
             ExceptionInfo
             download-perms-error-msg
             (check-download-permissions (mbql-download-query))))
        (testing "No exception is thrown for non-download queries"
          (let [query (dissoc (mbql-download-query :venues) :info)]
            (is (= query (check-download-permissions query)))))))))

(deftest check-download-permissions-test-2
  (testing "No exception is thrown if the user has any (full or limited) download permissions for the DB"
    (with-download-perms-for-db! (mt/id) :full
      (mt/with-current-user (mt/user->id :rasta)
        (is (= (mbql-download-query)
               (check-download-permissions (mbql-download-query))))))))

(deftest check-download-permissions-test-3
  (testing "No exception is thrown if the user has any (full or limited) download permissions for the DB"
    (with-download-perms-for-db! (mt/id) :limited
      (mt/with-current-user (mt/user->id :rasta)
        (is (= (mbql-download-query)
               (check-download-permissions (mbql-download-query))))))))

(deftest check-download-permissions-when-advanced-mbql-sandboxed-test
  (testing "Applying a basic sandbox does not affect the download permissions for a table"
    (mt/with-current-user (mt/user->id :rasta)
      (met/with-gtaps! {:gtaps {:checkins {:query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}}}
        (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :users)      :full
                                                           (mt/id :categories) :none
                                                           (mt/id :venues)     :limited
                                                           (mt/id :checkins)   :full
                                                           (mt/id :products)   :limited
                                                           (mt/id :people)     :limited
                                                           (mt/id :reviews)    :limited
                                                           (mt/id :orders)     :limited}}}
          (mt/with-metadata-provider (mt/id)
            (let [with-sandbox (apply-row-level-permissions (mbql-download-query :checkins))]
              (is (= with-sandbox
                     (check-download-permissions with-sandbox))))))))))

(deftest check-download-permissions-when-advanced-sql-sandboxed-test
  (testing "Applying a advanced sandbox does not affect the download permissions for a table"
    (mt/with-current-user (mt/user->id :rasta)
      (met/with-gtaps! {:gtaps {:checkins {:query (mt/native-query {:query "SELECT ID FROM CHECKINS"})}}}
        (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :users)      :full
                                                           (mt/id :categories) :none
                                                           (mt/id :venues)     :limited
                                                           (mt/id :checkins)   :full
                                                           (mt/id :products)   :limited
                                                           (mt/id :people)     :limited
                                                           (mt/id :reviews)    :limited
                                                           (mt/id :orders)     :limited}}}
          (mt/with-metadata-provider (mt/id)
            (let [with-sandbox (apply-row-level-permissions (mbql-download-query 'checkins))]
              (is (= with-sandbox
                     (check-download-permissions with-sandbox))))))))))

;;; +----------------------------------------------------------------------- -----------------------------------------+
;;; |                                                E2E tests                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- csv-row-count
  [results]
  (when-not ((some-fn string? bytes?) results)
    (throw (ex-info (format "Expected CSV results to be a byte array, got: %s" (class results))
                    {:actual results})))
  (count
   ;; Ignore first row, since it's the header
   (rest (csv/read-csv results))))

(deftest limited-download-perms-test
  (testing "Limited download perms work as expected"
    (mt/with-full-data-perms-for-all-users!
      (with-redefs [ee.qp.perms/max-rows-in-limited-downloads 3]
        (with-download-perms-for-db! (mt/id) :limited
          (streaming-test/do-test!
           "A user with limited download perms for a DB has their query results limited"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id :venues)
                                    :limit    10}}
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}})

          (streaming-test/do-test!
           "An admin has full download permissions, even if downloads for All Users are limited"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id :venues)
                                    :limit    10}}
            :user       :crowberto
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}}))

        (with-download-perms! (mt/id) {:schemas {"PUBLIC" :limited}}
          (streaming-test/do-test!
           "A user with limited download perms for a schema has their query results limited for queries on that schema"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id :venues)
                                    :limit    10}}
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}}))

        (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :users)      :full
                                                           (mt/id :categories) :full
                                                           (mt/id :venues)     :limited
                                                           (mt/id :checkins)   :full
                                                           (mt/id :products)   :limited
                                                           (mt/id :people)     :limited
                                                           (mt/id :reviews)    :limited
                                                           (mt/id :orders)     :limited}}}
          (streaming-test/do-test!
           "A user with limited download perms for a table has their query results limited for queries on that table"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id :venues)
                                    :limit        10}}
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}})

          (streaming-test/do-test!
           "A user with limited download perms for a table still has full download perms for MBQL queries on other tables"
           {:query      {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id :users)
                                    :limit        10}}
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}})

          (streaming-test/do-test!
           "A user with limited download perms for a table has limited download perms for native queries on all tables"
           {:query      (mt/native-query {:query "SELECT * FROM checkins LIMIT 10;"})
            :endpoints  [:card :dataset]
            :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}}))))))

(deftest no-download-perms-test
  (testing "Users with no download perms cannot run download queries"
    (mt/with-full-data-perms-for-all-users!
      (with-download-perms-for-db! (mt/id) :none
        (streaming-test/do-test!
         "A user with no download perms for a DB receives an error response"
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id :venues)
                                  :limit        10}}
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}})

        (streaming-test/do-test!
         "An admin can always run download queries, even if the All Users group has no download permissions "
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id :venues)
                                  :limit        10}}
          :user       :crowberto
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}}))

      (with-download-perms! (mt/id) {:schemas {"PUBLIC" :none}}
        (streaming-test/do-test!
         "A user with no download perms for a schema receives an error response for download queries on that schema"
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id :venues)
                                  :limit        10}}
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}}))

      (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)     :none
                                                         (mt/id :checkins)   :full
                                                         (mt/id :users)      :full
                                                         (mt/id :categories) :full}}}
        (streaming-test/do-test!
         "A user with no download perms for a table receives an error response for download queries on that table"
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id :venues)
                                  :limit        10}}
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}})

        (streaming-test/do-test!
         "A user with no download perms for a table still has full download perms for MBQL queries on other tables"
         {:query      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (mt/id :users)
                                  :limit        10}}
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}})

        (streaming-test/do-test!
         "A user with no download perms for a table has no download perms for native queries on all tables"
         {:query      (mt/native-query {:query "SELECT * FROM checkins LIMIT 10;"})
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}})))))

(deftest joins-test
  (mt/with-full-data-perms-for-all-users!
    (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)     :full
                                                       (mt/id :checkins)   :full
                                                       (mt/id :users)      :limited
                                                       (mt/id :categories) :none}}}
      (with-redefs [ee.qp.perms/max-rows-in-limited-downloads 3]
        (streaming-test/do-test!
         "A user can't download the results of a query with a join if they have no permissions for one of the tables"
         {:query (mt/mbql-query venues
                   {:joins [{:source-table $$categories
                             :condition    [:= $category_id 1]}]
                    :limit 10})
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results]
                              (is (partial=
                                   {:error "You do not have permissions to download the results of this query."}
                                   results)))}})

        (streaming-test/do-test!
         "A user has limited downloads for a query with a join if they have limited permissions for one of the tables"
         {:query (mt/mbql-query checkins
                   {:joins [{:source-table $$users
                             :condition    [:= $user_id 1]}]
                    :limit 10})
          :endpoints  [:card :dataset]
          :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}})))))

(defn- do-joined-card-test! [venues-perms f]
  (mt/with-full-data-perms-for-all-users!
    (with-redefs [ee.qp.perms/max-rows-in-limited-downloads 3]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table (mt/id :venues)}}}]
        (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)   venues-perms
                                                           (mt/id :checkins) :full}}}
          (let [query (mt/mbql-query checkins
                        {:joins    [{:fields       [&card.venues.id]
                                     :source-table (format "card__%d" card-id)
                                     :alias        "card"
                                     :condition    [:= $checkins.venue_id &card.venues.id]
                                     :strategy     :left-join}]
                         :order-by [[:asc $id]]
                         :limit    10})]
            (f query)))))))

(deftest joined-card-test
  (testing "Do we correctly check download perms for queries that involve a join between a table and a card? (#50304)"
    (do-joined-card-test!
     :full
     (fn [query]
       (streaming-test/do-test!
        "A table joined to a card, both with full download perms"
        ;; I would expect this to return 5 columns: the four from checkins, and then the one from the Card
        {:query      query
         :endpoints  [:card :dataset]
         :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}})))))

(deftest joined-card-test-2
  (testing "Do we correctly check download perms for queries that involve a join between a table and a card? (#50304)"
    (do-joined-card-test!
     :limited
     (fn [query]
       (streaming-test/do-test!
        "A table joined to a card, with limited download perms for the card, results in a limited download"
        {:query      query
         :endpoints  [:card :dataset]
         :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}})))))

(deftest joined-card-test-3
  (testing "Do we correctly check download perms for queries that involve a join between a table and a card? (#50304)"
    (do-joined-card-test!
     :none
     (fn [query]
       (streaming-test/do-test!
        "A table joined to a card, with no download perms for the card, results in blocked download"
        {:query      query
         :endpoints  [:card :dataset]
         :assertions {:csv (fn [results]
                             (is (partial=
                                  {:error "You do not have permissions to download the results of this query."}
                                  results)))}})))))

(deftest sandbox-card-test
  (testing "Do we correctly check download perms for queries that involve a sandbox? (#57861)"
    (mt/with-full-data-perms-for-all-users!
      (with-redefs [ee.qp.perms/max-rows-in-limited-downloads 3]
        (met/with-gtaps! {:gtaps {:checkins {:query (mt/native-query {:query "SELECT ID FROM CHECKINS"})}}}
          (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :categories) :none
                                                             (mt/id :checkins)   :full}}}
            (streaming-test/do-test!
             "A table with sandbox and full download perms"
             {:query {:database (mt/id)
                      :type     :query
                      :query    {:source-table (mt/id :checkins)
                                 :limit        10}}
              :endpoints  [:card :dataset]
              :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}}))

          (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :categories) :none
                                                             (mt/id :checkins)   :limited}}}
            (streaming-test/do-test!
             "A table with sandbox and limited download perms"
             {:query      {:database (mt/id)
                           :type     :query
                           :query    {:source-table (mt/id :checkins)
                                      :limit        10}}
              :endpoints  [:card :dataset]
              :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}}))

          (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :categories) :none
                                                             (mt/id :checkins)   :none}}}
            (streaming-test/do-test!
             "A table with sandbox and not download perms"
             {:query      {:database (mt/id)
                           :type     :query
                           :query    {:source-table (mt/id :checkins)
                                      :limit        10}}
              :endpoints  [:card :dataset]
              :assertions {:csv (fn [results]
                                  (is (partial=
                                       {:error "You do not have permissions to download the results of this query."}
                                       results)))}})))))))

(defn- do-joined-cards-with-native-query-test! [f]
  (testing "Do we correctly apply the least permissive download perms when joining cards where one has a native query?"
    (mt/with-full-data-perms-for-all-users!
      (with-redefs [ee.qp.perms/max-rows-in-limited-downloads 3]
        (mt/with-temp [:model/Card {mbql-card-id :id} {:dataset_query {:database (mt/id)
                                                                       :type     :query
                                                                       :query    {:source-table (mt/id :venues)}}}
                       :model/Card {native-card-id :id} {:dataset_query   {:database (mt/id)
                                                                           :type     :native
                                                                           :native   {:query "SELECT * FROM checkins"}}
                                                         :result_metadata (for [field (meta/fields :checkins)]
                                                                            (-> (meta/field-metadata :checkins field)
                                                                                (dissoc :id :table-id)))}]
          (f {:mbql-card-id mbql-card-id, :native-card-id native-card-id}))))))

(deftest joined-cards-with-native-query-test
  (do-joined-cards-with-native-query-test!
   (fn [{:keys [mbql-card-id native-card-id]}]
     (testing "When one card has native query, least permissive DB-level permission applies"
       (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)   :full
                                                          (mt/id :checkins) :limited
                                                          (mt/id :users)    :full}}}
         (streaming-test/do-test!
          "Join between MBQL card (venues:full) and native card - should use limited perms due to native query"
          {:query      {:database (mt/id)
                        :type     :query
                        :query    {:source-table (format "card__%d" mbql-card-id)
                                   :joins        [{:fields       [[:field "ID" {:base-type :type/Integer}]]
                                                   :source-table (format "card__%d" native-card-id)
                                                   :alias        "native_card"
                                                   :condition    [:=
                                                                  [:field "ID" {:base-type :type/Integer}]
                                                                  [:field "VENUE_ID" {:base-type :type/Integer, :join-alias "native_card"}]]
                                                   :strategy     :left-join}]
                                   :limit        10}}
           :endpoints  [:card :dataset]
           :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}}))))))

(deftest joined-cards-with-native-query-test-2
  (do-joined-cards-with-native-query-test!
   (fn [{:keys [mbql-card-id native-card-id]}]
     (testing "When native card references tables with no download perms, download is blocked"
       (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)   :full
                                                          (mt/id :checkins) :none
                                                          (mt/id :users)    :limited}}}
         (streaming-test/do-test!
          "Join between MBQL card (venues:full) and native card - should block due to checkins:none"
          {:query      {:database (mt/id)
                        :type     :query
                        :query    {:source-table (format "card__%d" mbql-card-id)
                                   :joins        [{:fields       [[:field "ID" {:base-type :type/Integer}]]
                                                   :source-table (format "card__%d" native-card-id)
                                                   :alias        "native_card"
                                                   :condition    [:= [:field "ID" {:base-type :type/Integer}]
                                                                  [:field "VENUE_ID" {:base-type :type/Integer, :join-alias "native_card"}]]
                                                   :strategy     :left-join}]
                                   :limit        10}}
           :endpoints  [:card :dataset]
           :assertions {:csv (fn [results]
                               (is (partial=
                                    {:error "You do not have permissions to download the results of this query."}
                                    results)))}}))))))

(deftest joined-cards-with-native-query-test-3
  (do-joined-cards-with-native-query-test!
   (fn [{:keys [mbql-card-id native-card-id]}]
     (testing "When all tables have full perms, download works normally"
       (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)   :full
                                                          (mt/id :checkins) :full
                                                          (mt/id :users)    :full}}}
         (streaming-test/do-test!
          "Join between MBQL card and native card - should work with full perms for all tables"
          {:query      {:database (mt/id)
                        :type     :query
                        :query    {:source-table (format "card__%d" mbql-card-id)
                                   :joins        [{:fields       [[:field "ID" {:base-type :type/Integer}]]
                                                   :source-table (format "card__%d" native-card-id)
                                                   :alias        "native_card"
                                                   :condition    [:= [:field "ID" {:base-type :type/Integer}]
                                                                  [:field "VENUE_ID" {:base-type :type/Integer, :join-alias "native_card"}]]
                                                   :strategy     :left-join}]
                                   :limit        10}}
           :endpoints  [:card :dataset]
           :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}}))))))

(defn- do-with-card-with-native-source-card! [f]
  (mt/with-full-data-perms-for-all-users!
    (with-redefs [ee.qp.perms/max-rows-in-limited-downloads 3]
      (mt/with-temp [:model/Card {native-source-card-id :id} {:dataset_query {:database (mt/id)
                                                                              :type     :native
                                                                              :native   {:query "SELECT * FROM checkins"}}}
                     :model/Card {mbql-card-id :id} {:dataset_query {:database (mt/id)
                                                                     :type     :query
                                                                     :query    {:source-table (format "card__%d" native-source-card-id)
                                                                                :aggregation  [[:count]]
                                                                                :breakout     [[:field "VENUE_ID" {:base-type :type/Integer}]]}}}]
        (f {:mbql-card-id mbql-card-id})))))

(deftest card-with-native-source-card-test
  (testing "Do we correctly apply download perms when downloading from a card that uses a source card with a native query?"
    (do-with-card-with-native-source-card!
     (fn [{:keys [mbql-card-id]}]
       (testing "When source card has native query with limited perms, download is limited"
         (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)   :full
                                                            (mt/id :checkins) :limited
                                                            (mt/id :users)    :full}}}
           (streaming-test/do-test!
            "Card with native source card - should use limited perms due to native query in source"
            {:query      {:database (mt/id)
                          :type     :query
                          :query    {:source-table (format "card__%d" mbql-card-id)
                                     :limit        10}}
             :endpoints  [:card :dataset]
             :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}})))))))

(deftest card-with-native-source-card-test-2
  (testing "Do we correctly apply download perms when downloading from a card that uses a source card with a native query?"
    (do-with-card-with-native-source-card!
     (fn [{:keys [mbql-card-id]}]
       (testing "When source card has native query with no download perms, download is blocked"
         (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)   :full
                                                            (mt/id :checkins) :none
                                                            (mt/id :users)    :full}}}
           (streaming-test/do-test!
            "Card with native source card - should block due to checkins:none in native source"
            {:query      {:database (mt/id)
                          :type     :query
                          :query    {:source-table (format "card__%d" mbql-card-id)
                                     :limit        10}}
             :endpoints  [:card :dataset]
             :assertions {:csv (fn [results]
                                 (is (partial=
                                      {:error "You do not have permissions to download the results of this query."}
                                      results)))}})))))))

(deftest card-with-native-source-card-test-3
  (testing "Do we correctly apply download perms when downloading from a card that uses a source card with a native query?"
    (do-with-card-with-native-source-card!
     (fn [{:keys [mbql-card-id]}]
       (testing "When source card has native query with full perms, download works normally"
         (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)   :full
                                                            (mt/id :checkins) :full
                                                            (mt/id :users)    :full}}}
           (streaming-test/do-test!
            "Card with native source card - should work with full perms for all tables"
            {:query      {:database (mt/id)
                          :type     :query
                          :query    {:source-table (format "card__%d" mbql-card-id)
                                     :limit        10}}
             :endpoints  [:card :dataset]
             :assertions {:csv (fn [results] (is (= 10 (csv-row-count results))))}})))))))

(deftest card-with-native-source-card-test-4
  (testing "Do we correctly apply download perms when downloading from a card that uses a source card with a native query?"
    (do-with-card-with-native-source-card!
     (fn [{:keys [mbql-card-id]}]
       (testing "Nested source cards with native query apply least permissive perms"
         (mt/with-temp [:model/Card {nested-card-id :id} {:dataset_query {:database (mt/id)
                                                                          :type     :query
                                                                          :query    {:source-table (format "card__%d" mbql-card-id)
                                                                                     :filter       [:> [:field "count" {:base-type :type/Integer}] 1]}}}]
           (with-download-perms! (mt/id) {:schemas {"PUBLIC" {(mt/id :venues)   :full
                                                              (mt/id :checkins) :limited
                                                              (mt/id :users)    :full}}}
             (streaming-test/do-test!
              "Nested card with native source card - should use limited perms from deepest native query"
              {:query      {:database (mt/id)
                            :type     :query
                            :query    {:source-table (format "card__%d" nested-card-id)
                                       :limit        10}}
               :endpoints  [:card :dataset]
               :assertions {:csv (fn [results] (is (= 3 (csv-row-count results))))}}))))))))
