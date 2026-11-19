(ns metabase-enterprise.data-testing.card-api-test
  "`/api/ee/card-test`."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.data-testing.util :as data-testing.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :cast_type "INTEGER"} {:name "NAME" :cast_type "VARCHAR"}]
    :rows    [{"ID" 1 "NAME" "abc"}]}])

(def ^:private expectations
  [{:type "empty" :name "no other rows" :sql "SELECT * FROM {{output}} WHERE ID <> 1"}])

(defn- card
  "A native card reading the table `inputs` stands in for, in the collection `collection-id`."
  ([] (card nil))
  ([collection-id]
   {:name          "People"
    :collection_id collection-id
    :dataset_query (lib/native-query (mt/metadata-provider) "SELECT ID, NAME FROM PUBLIC.PEOPLE")}))

(defn- body
  [card-id]
  {:card_id card-id :name "My test" :inputs inputs :expectations expectations})

(deftest premium-feature-test
  (testing "every endpoint refuses an instance without the feature"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card     {card-id :id} (card)
                     :model/CardTest {test-id :id} {:card_id card-id}]
        (let [path (str "ee/card-test/" test-id)]
          (doseq [request [[:get 402 "ee/card-test"]
                           [:post 402 "ee/card-test" (body card-id)]
                           [:get 402 path]
                           [:put 402 path {:name "t"}]
                           [:delete 402 path]
                           [:post 402 (str path "/run")]]]
            (mt/assert-has-premium-feature-error
             "Transforms Testing"
             (apply mt/user-http-request :crowberto request))))))))

(deftest crud-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card {card-id :id} (card)
                   :model/Card {other-id :id} (card)]
      (let [created (mt/user-http-request :crowberto :post 200 "ee/card-test" (assoc (body card-id) :description "abc"))
            path    (str "ee/card-test/" (:id created))]
        (try
          (testing "POST creates the test as the current user"
            (is (=? {:id           pos-int?
                     :entity_id    string?
                     :card_id      card-id
                     :creator_id   (mt/user->id :crowberto)
                     :name         "My test"
                     :description  "abc"
                     :inputs       [{:format "rows" :rows [{:ID 1 :NAME "abc"}]}]
                     :expectations expectations}
                    created)))
          (testing "GET returns the test with its newest run"
            (is (= (assoc created :last_run nil) (mt/user-http-request :crowberto :get 200 path))))
          (testing "GET / filters by card"
            (is (= [(:id created)]
                   (map :id (mt/user-http-request :crowberto :get 200 "ee/card-test" :card-id card-id))))
            (is (= [] (mt/user-http-request :crowberto :get 200 "ee/card-test" :card-id other-id)))
            (is (some #{(:id created)} (map :id (mt/user-http-request :crowberto :get 200 "ee/card-test")))))
          (testing "PUT changes only the given keys"
            (is (=? {:name "Renamed" :description "abc" :card_id other-id}
                    (mt/user-http-request :crowberto :put 200 path {:name "Renamed" :card_id other-id}))))
          (testing "DELETE removes the test"
            (mt/user-http-request :crowberto :delete 204 path)
            (is (not (t2/exists? :model/CardTest :id (:id created))))
            (mt/user-http-request :crowberto :get 404 path))
          (finally
            (t2/delete! :model/CardTest :id (:id created))))))))

(deftest unsaved-run-endpoint-does-not-exist-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card {card-id :id} (card)]
      (testing "a card test runs only as a saved test"
        (mt/user-http-request :crowberto :post 404 "ee/card-test/run"
                              {:card {:dataset_query (:dataset_query (card))} :test (dissoc (body card-id) :card_id)})))))

(deftest a-test-of-a-missing-card-is-refused-as-forbidden-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card     {card-id :id} (card)
                   :model/CardTest {test-id :id} {:card_id card-id :inputs inputs :expectations expectations}]
      (let [missing-id (inc (t2/select-one-fn :max-id [:model/Card [:%max.id :max-id]]))]
        (testing "even for an admin, the permission check refuses a card that does not exist"
          (mt/user-http-request :crowberto :post 403 "ee/card-test" (body missing-id))
          (mt/user-http-request :crowberto :put 403 (str "ee/card-test/" test-id) {:card_id missing-id}))
        (testing "control: the same requests on the existing card succeed"
          (mt/user-http-request :crowberto :put 200 (str "ee/card-test/" test-id) {:card_id card-id}))))))

(deftest write-endpoints-refuse-a-test-that-could-not-run-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card     {card-id :id} (card)
                   :model/CardTest {test-id :id} {:card_id card-id :inputs inputs :expectations expectations}]
      (testing "POST refuses a test missing an input, under the card-test error prefix"
        (let [response (mt/user-http-request :crowberto :post 400 "ee/card-test" (assoc (body card-id) :inputs []))]
          (is (= "card-test.missing-inputs" (:error-code response)))
          (is (= ["PUBLIC.PEOPLE"] (:tables response)))))
      (testing "POST refuses a test with no expectations"
        (is (= "card-test.no-expectations"
               (:error-code (mt/user-http-request :crowberto :post 400 "ee/card-test" (assoc (body card-id) :expectations []))))))
      (testing "PUT refuses a change that makes the test unrunnable, and keeps the test"
        (is (= "card-test.missing-inputs"
               (:error-code (mt/user-http-request :crowberto :put 400 (str "ee/card-test/" test-id) {:inputs []}))))
        (is (= 1 (count (:inputs (t2/select-one :model/CardTest :id test-id)))))))))

(deftest now-test
  (mt/with-premium-features #{:transforms-testing}
    (let [mp (mt/metadata-provider)]
      ;; The query reads only the columns `inputs` declares.
      (mt/with-temp [:model/Card {mbql-id :id}   {:dataset_query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                                                                     (lib/with-fields [(lib.metadata/field mp (mt/id :people :id))
                                                                                       (lib.metadata/field mp (mt/id :people :name))]))}
                     :model/Card {native-id :id} (card)]
        (mt/with-model-cleanup [:model/CardTest]
          (let [created (mt/user-http-request :crowberto :post 200 "ee/card-test"
                                              (assoc (body mbql-id) :now "2026-10-13T09:00:00+09:00"))
                path    (str "ee/card-test/" (:id created))]
            (testing "POST saves `now` as the moment it names"
              (is (= (t/instant "2026-10-13T00:00:00Z") (t/instant (:now created))))
              (is (= (t/instant "2026-10-13T00:00:00Z")
                     (t/instant (:now (mt/user-http-request :crowberto :get 200 path))))))
            (testing "PUT with a null `now` returns the test to the real clock"
              (is (=? {:now nil} (mt/user-http-request :crowberto :put 200 path {:now nil}))))
            (let [refusals (fn [now]
                             (-> (mt/user-http-request :crowberto :post 400 "ee/card-test" (assoc (body mbql-id) :now now))
                                 (get-in [:specific-errors :now])
                                 vec))]
              (testing "a date-time without an offset is refused, since it names no moment, and only for that"
                (let [[refusal & more] (refusals "2026-10-13T00:00:00")]
                  (is (empty? more))
                  (is (re-find #"with an offset" refusal))))
              (testing "a moment an app DB cannot store is refused, and only for that"
                (let [[refusal & more] (refusals "2040-01-01T00:00:00Z")]
                  (is (empty? more))
                  (is (re-find #"inclusive" refusal)))))
            (testing "`now` on a test of a native card is refused, as it is saved"
              (is (= "card-test.now-on-native-sql"
                     (:error-code (mt/user-http-request :crowberto :post 501 "ee/card-test"
                                                        (assoc (body native-id) :now "2026-10-13T00:00:00Z")))))
              (testing "and as it is changed"
                (mt/with-temp [:model/CardTest {native-test-id :id} {:card_id native-id :inputs inputs :expectations expectations}]
                  (is (= "card-test.now-on-native-sql"
                         (:error-code (mt/user-http-request :crowberto :put 501 (str "ee/card-test/" native-test-id)
                                                            {:now "2026-10-13T00:00:00Z"}))))
                  (is (nil? (t2/select-one-fn :now :model/CardTest :id native-test-id))))))))))))

(deftest run-saved-test-test
  (mt/with-premium-features #{:transforms-testing}
    ;; A run counts as the test's run only if it started after the test was created. The with-temp default for
    ;; `created_at` is the JVM's clock and the run's start time is the app DB's, so the test is dated in the past.
    (mt/with-temp [:model/Card     {card-id :id} (card)
                   :model/CardTest {test-id :id} {:card_id      card-id
                                                  :inputs       inputs
                                                  :expectations expectations
                                                  :created_at   #t "2025-01-01T00:00:00Z"}]
      (let [path (str "ee/card-test/" test-id)]
        (try
          (testing "a run reports each expectation"
            (is (=? {:status       "passed"
                     :expectations [{:name "no other rows" :status "passed"}]}
                    (mt/user-http-request :crowberto :post 200 (str path "/run")))))
          (testing "the run is the test's newest run, and is in the run history of the test"
            (let [{:keys [last_run]} (mt/user-http-request :crowberto :get 200 path)]
              (is (=? {:test_type "card" :test_id test-id :status "passed"} last_run))
              (is (= [(:id last_run)]
                     (map :id (:data (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                           :test-type "card" :test-id test-id)))))))
          (testing "a run refused by the runner publishes the card-test prefix"
            (t2/update! :model/CardTest :id test-id {:inputs []})
            (is (= "card-test.missing-inputs"
                   (:error-code (mt/user-http-request :crowberto :post 400 (str path "/run"))))))
          (finally
            (t2/delete! :model/DataTestRun :test_type "card" :test_id test-id)))))))

(deftest run-history-of-card-tests-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection  {coll-id :id} {}
                     :model/Card        {card-id :id} (card coll-id)
                     :model/CardTest    {test-id :id} {:card_id card-id}
                     :model/DataTestRun {run-id :id}  {:test_type :card :test_id test-id}]
        (testing "the runs of a card test are listed by its type and id"
          (is (= [run-id] (map :id (:data (mt/user-http-request :crowberto :get 200 "ee/data-test-run"
                                                                :test-type "card" :test-id test-id))))))
        (testing "the read check follows the card"
          (mt/user-http-request :rasta :get 403 "ee/data-test-run" :test-type "card" :test-id test-id))))))

(deftest list-needs-data-studio-access-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id}        {}
                     :model/Collection {hidden-coll-id :id} {}
                     :model/Card       {card-id :id}        (card coll-id)
                     :model/Card       {hidden-card-id :id} (card hidden-coll-id)
                     :model/CardTest   {test-id :id}        {:card_id card-id}
                     :model/CardTest   {hidden-test-id :id} {:card_id hidden-card-id}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (testing "a user who can read the card but not enter Data Studio cannot list card tests"
          (is (= test-id (:id (mt/user-http-request :rasta :get 200 (str "ee/card-test/" test-id)))))
          (mt/user-http-request :rasta :get 403 "ee/card-test"))
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (testing "a user who can enter Data Studio lists the tests of the cards they can read, and only those"
            (let [listed (set (map :id (mt/user-http-request :lucky :get 200 "ee/card-test")))]
              (is (contains? listed test-id))
              (is (not (contains? listed hidden-test-id))))))))))

(deftest permissions-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-non-admin-groups-no-root-collection-perms
      (perms.tu/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Card       {card-id :id} (card coll-id)
                       :model/CardTest   {test-id :id} {:card_id card-id :inputs inputs :expectations expectations}]
          (let [path (str "ee/card-test/" test-id)]
            (try
              (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                            :perms/create-queries :query-builder-and-native}
                (testing "no collection access to the card: 403 on get and on run"
                  (mt/user-http-request :rasta :get 403 path)
                  (mt/user-http-request :rasta :post 403 (str path "/run")))
                (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
                (testing "collection read: get and run, but not create, update or delete"
                  (is (= test-id (:id (mt/user-http-request :rasta :get 200 path))))
                  (is (= "passed" (:status (mt/user-http-request :rasta :post 200 (str path "/run")))))
                  (mt/user-http-request :rasta :post 403 "ee/card-test" (body card-id))
                  (mt/user-http-request :rasta :put 403 path {:name "nope"})
                  (mt/user-http-request :rasta :delete 403 path))
                (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
                (testing "collection write and native queries: create and update"
                  (let [created (mt/user-http-request :rasta :post 200 "ee/card-test" (body card-id))]
                    (t2/delete! :model/CardTest :id (:id created)))
                  (is (=? {:name "renamed"} (mt/user-http-request :rasta :put 200 path {:name "renamed"})))))
              (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                            :perms/create-queries :query-builder}
                (testing "no native queries on the card's database: 403 on create and on run"
                  (mt/user-http-request :rasta :post 403 "ee/card-test" (body card-id))
                  (mt/user-http-request :rasta :post 403 (str path "/run"))
                  (is (= test-id (:id (mt/user-http-request :rasta :get 200 path))))))
              (finally
                (t2/delete! :model/DataTestRun :test_type "card" :test_id test-id)))))))))

(deftest tests-of-a-card-referencing-an-unreadable-card-are-refused-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-non-admin-groups-no-root-collection-perms
      (perms.tu/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection {coll-id :id}        {}
                       :model/Collection {hidden-coll-id :id} {}
                       :model/Card       {hidden-id :id}      (card hidden-coll-id)]
          (let [tag     (str "#" hidden-id "-people")
                query   (-> (lib/native-query (mt/metadata-provider) (str "SELECT * FROM {{" tag "}}"))
                            (lib/with-template-tags {tag {:type         :card
                                                          :name         tag
                                                          :display-name tag
                                                          :id           (str (random-uuid))
                                                          :card-id      hidden-id}}))
                created (atom [])]
            (mt/with-temp [:model/Card     {card-id :id} {:name "Outer" :collection_id coll-id :dataset_query query}
                           :model/CardTest {test-id :id} {:card_id      card-id
                                                          :inputs       inputs
                                                          :expectations expectations
                                                          :created_at   #t "2025-01-01T00:00:00Z"}]
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
              (try
                (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                              :perms/create-queries :query-builder-and-native}
                  (testing "premise: the user cannot read the referenced card, so cannot run the card"
                    (mt/user-http-request :rasta :get 403 (str "card/" hidden-id))
                    (is (= "failed" (:status (mt/user-http-request :rasta :post 403 (str "card/" card-id "/query"))))))
                  (testing "creating and running a test of the card are refused"
                    (let [response (mt/user-http-request :rasta :post "ee/card-test" (body card-id))]
                      (when-let [id (:id response)] (swap! created conj id))
                      (is (= "You don't have permissions to do that." response)))
                    (mt/user-http-request :rasta :post 403 (str "ee/card-test/" test-id "/run")))
                  (perms/grant-collection-read-permissions! (perms-group/all-users) hidden-coll-id)
                  (testing "once the referenced card is readable, the card runs, and its tests are created and run"
                    (is (= "completed" (:status (mt/user-http-request :rasta :post 202 (str "card/" card-id "/query")))))
                    (swap! created conj (:id (mt/user-http-request :rasta :post 200 "ee/card-test" (body card-id))))
                    (is (= "passed" (:status (mt/user-http-request :rasta :post 200 (str "ee/card-test/" test-id "/run")))))))
                (finally
                  (t2/delete! :model/DataTestRun :test_type "card" :test_id test-id)
                  (when (seq @created)
                    (t2/delete! :model/CardTest :id [:in @created])))))))))))

(deftest a-test-whose-input-lacks-a-column-the-card-reads-is-refused-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card {card-id :id} (card)]
      (testing "create refuses an input lacking a column the card's query reads, naming it, and saves nothing"
        (is (=? {:error-code "card-test.missing-input-columns"
                 :columns    {:PUBLIC.PEOPLE ["NAME"]}}
                (mt/user-http-request :crowberto :post 400 "ee/card-test"
                                      (assoc (body card-id)
                                             :name   "id only"
                                             :inputs [(assoc (first inputs)
                                                             :columns [{:name "ID" :cast_type "INTEGER"}]
                                                             :rows    [{"ID" 1}])]))))
        (is (not (t2/exists? :model/CardTest :name "id only"))))
      (testing "control: an input declaring every column the card's query reads is saved"
        (t2/delete! :model/CardTest :id (:id (mt/user-http-request :crowberto :post 200 "ee/card-test" (body card-id)))))
      (testing "the input's table is found in Metabase's metadata whatever the case of its name"
        (is (=? {:error-code "card-test.missing-input-columns"
                 :columns    {:PUBLIC.people ["NAME"]}}
                (mt/user-http-request :crowberto :post 400 "ee/card-test"
                                      (assoc (body card-id) :inputs [(-> (first inputs)
                                                                         (assoc-in [:table :name] "people")
                                                                         (assoc :columns [{:name "ID" :cast_type "INTEGER"}]
                                                                                :rows    [{"ID" 1}]))]))))))))

(deftest the-missing-columns-check-skips-a-table-that-metabase-hides-test
  ;; Pins the documented exception: the check reads metadata that leaves hidden tables out. Turns red when the check
  ;; covers them.
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card {card-id :id} (card)]
      (mt/with-temp-vals-in-db :model/Table (mt/id :people) {:visibility_type "hidden"}
        (testing "an input for a table that Metabase hides, lacking a column the card reads, is saved"
          (t2/delete! :model/CardTest
                      :id (:id (mt/user-http-request :crowberto :post 200 "ee/card-test"
                                                     (assoc (body card-id)
                                                            :inputs [(assoc (first inputs)
                                                                            :columns [{:name "ID" :cast_type "INTEGER"}]
                                                                            :rows    [{"ID" 1}])])))))))))

(deftest the-database-s-case-rule-decides-whether-a-declared-column-name-matches-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card {card-id :id} (card)]
      (let [lower-case [(assoc (first inputs)
                               :columns [{:name "id" :cast_type "INTEGER"} {:name "name" :cast_type "VARCHAR"}]
                               :rows    [{"id" 1 "name" "abc"}])]
            create     (fn [status]
                         (mt/user-http-request :crowberto :post status "ee/card-test"
                                               (assoc (body card-id) :name "lower case" :inputs lower-case)))]
        (testing "on H2, which keeps the case of column names, names that differ from the table's only in case are missing"
          (is (=? {:error-code "card-test.missing-input-columns"
                   :columns    {:PUBLIC.PEOPLE ["ID" "NAME"]}}
                  (create 400)))
          (is (not (t2/exists? :model/CardTest :name "lower case"))))
        (testing "on a database that ignores case, the same names are the table's columns, and the test is saved"
          ;; Stands in for the databases that ignore case in column names, which no test of this namespace runs on.
          (with-redefs [data-testing.u/column-names-ignore-case? (constantly true)]
            (t2/delete! :model/CardTest :id (:id (create 200)))))))))
