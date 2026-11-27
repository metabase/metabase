(ns metabase-enterprise.data-testing.card-api-test
  "`/api/ee/card-test`."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
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

(deftest a-test-of-a-card-with-no-query-is-refused-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card     {card-id :id} (assoc (card) :dataset_query {})
                   :model/CardTest {test-id :id} {:card_id card-id :inputs inputs :expectations expectations}]
      (testing "premise: the card has no query"
        (is (= {} (t2/select-one-fn :dataset_query :model/Card :id card-id))))
      (testing "POST refuses a test of a card with no query, as one whose query cannot be compiled"
        (is (=? {:error-code "card-test.uncompilable-subject"}
                (mt/user-http-request :crowberto :post 422 "ee/card-test" (body card-id)))))
      (testing "a run of a saved test of it is refused the same way"
        (is (=? {:error-code "card-test.uncompilable-subject"}
                (mt/user-http-request :crowberto :post 422 (str "ee/card-test/" test-id "/run")))))
      (testing "an edit of the inputs of a saved test of it is refused the same way, and changes nothing"
        (let [before (t2/select-one :model/CardTest :id test-id)]
          (is (=? {:error-code "card-test.uncompilable-subject"}
                  (mt/user-http-request :crowberto :put 422 (str "ee/card-test/" test-id)
                                        {:inputs [(assoc (first inputs) :rows [{"ID" 2 "NAME" "def"}])]})))
          (is (= before (t2/select-one :model/CardTest :id test-id))))))))

(deftest an-archived-card-with-no-query-gets-one-refusal-test
  (testing "a card that is archived and has no query is refused for having no query, on every write and on a run"
    (mt/with-premium-features #{:transforms-testing}
      (mt/with-temp [:model/Card     {card-id :id} (assoc (card) :dataset_query {} :archived true)
                     :model/CardTest {test-id :id} {:card_id card-id :inputs inputs :expectations expectations}]
        (let [path    (str "ee/card-test/" test-id)
              refused {:error-code "card-test.uncompilable-subject"}]
          (testing "premise: the card is archived and has no query"
            (is (=? {:archived true :dataset_query {}} (t2/select-one :model/Card :id card-id))))
          (is (=? refused (mt/user-http-request :crowberto :post 422 "ee/card-test" (body card-id))))
          (is (=? refused (mt/user-http-request :crowberto :post 422 (str path "/run"))))
          (testing "an edit of the name"
            (is (=? refused (mt/user-http-request :crowberto :put 422 path {:name "Renamed"}))))
          (testing "an edit of the inputs"
            (is (=? refused (mt/user-http-request :crowberto :put 422 path {:inputs inputs})))))))))

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
                (testing "collection read and native queries: get, run and create, but not update or delete"
                  (is (= test-id (:id (mt/user-http-request :rasta :get 200 path))))
                  (is (= "passed" (:status (mt/user-http-request :rasta :post 200 (str path "/run")))))
                  (let [created (mt/user-http-request :rasta :post 200 "ee/card-test" (body card-id))]
                    (t2/delete! :model/CardTest :id (:id created)))
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
      (mt/with-temp-vals-in-db :model/Table (mt/id :people) {:data_layer :hidden}
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

(deftest tests-of-an-archived-card-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card     {card-id :id}   (card)
                   :model/Card     {active-id :id} (card)
                   :model/CardTest {test-id :id}   {:card_id      card-id
                                                    :inputs       inputs
                                                    :expectations expectations
                                                    :created_at   #t "2025-01-01T00:00:00Z"}]
      (let [path      (str "ee/card-test/" test-id)
            run-ids   (atom #{})
            test-name (t2/select-one-fn :name :model/CardTest :id test-id)
            listed    (fn [& params]
                        (into #{} (map :id) (apply mt/user-http-request :crowberto :get 200 "ee/card-test" params)))]
        (try
          (t2/update! :model/Card :id card-id {:archived true})
          (testing "the list leaves the test out, unless asked to include archived subjects"
            (is (not (contains? (listed) test-id)))
            (is (not (contains? (listed :card-id card-id) test-id)))
            (is (contains? (listed :include-archived true) test-id))
            (is (contains? (listed :card-id card-id :include-archived true) test-id)))
          (testing "the test is still readable by id"
            (is (=? {:id test-id} (mt/user-http-request :crowberto :get 200 path))))
          (testing "a run is refused, and records no run"
            (is (=? {:error-code "card-test.archived-subject"}
                    (mt/user-http-request :crowberto :post 422 (str path "/run"))))
            (is (not (t2/exists? :model/DataTestRun :test_type "card" :test_id test-id))))
          (testing "a new test of the card is refused"
            (is (=? {:error-code "card-test.archived-subject"}
                    (mt/user-http-request :crowberto :post 422 "ee/card-test" (body card-id)))))
          (testing "an edit that keeps the test on the card is refused, and changes nothing"
            (is (=? {:error-code "card-test.archived-subject"}
                    (mt/user-http-request :crowberto :put 422 path {:name "Renamed"})))
            (is (= test-name (t2/select-one-fn :name :model/CardTest :id test-id))))
          (testing "after the card is restored, the test is listed and runs"
            (t2/update! :model/Card :id card-id {:archived false})
            (is (contains? (listed) test-id))
            (is (=? {:status "passed"} (mt/user-http-request :crowberto :post 200 (str path "/run")))))
          (testing "moving the test off an archived card, onto an active one, is allowed"
            (t2/update! :model/Card :id card-id {:archived true})
            (is (=? {:card_id active-id} (mt/user-http-request :crowberto :put 200 path {:card_id active-id}))))
          (testing "moving the test back onto the archived card is refused"
            (is (=? {:error-code "card-test.archived-subject"}
                    (mt/user-http-request :crowberto :put 422 path {:card_id card-id}))))
          (testing "a test of an archived card can be deleted"
            ;; Deleting the test clears `test_id` on its runs, so the cleanup below finds them by id.
            (reset! run-ids (t2/select-pks-set :model/DataTestRun :test_type "card" :test_id test-id))
            (t2/update! :model/CardTest :id test-id {:card_id card-id})
            (mt/user-http-request :crowberto :delete 204 path)
            (is (not (t2/exists? :model/CardTest :id test-id))))
          (finally
            (t2/delete! :model/DataTestRun :test_type "card" :test_id test-id)
            (when (seq @run-ids)
              (t2/delete! :model/DataTestRun :id [:in @run-ids]))))))))

(deftest a-revert-cannot-move-a-test-onto-an-archived-card-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card {archived-id :id} (card)
                   :model/Card {active-id :id}   (card)]
      (let [test-id     (:id (mt/user-http-request :crowberto :post 200 "ee/card-test" (body archived-id)))
            path        (str "ee/card-test/" test-id)
            _           (mt/user-http-request :crowberto :put 200 path {:card_id active-id})
            creation-id (->> (mt/user-http-request :crowberto :get 200 (str "revision/card-test/" test-id))
                             (m/find-first :is_creation)
                             :id)]
        (try
          (t2/update! :model/Card :id archived-id {:archived true})
          (testing "a revert to the revision on the archived card is refused, and leaves the test where it is"
            (is (pos-int? creation-id))
            (is (=? {:error-code "card-test.archived-subject"}
                    (mt/user-http-request :crowberto :post 422 "revision/revert"
                                          {:entity "card-test" :id test-id :revision_id creation-id})))
            (is (= active-id (t2/select-one-fn :card_id :model/CardTest :id test-id))))
          (testing "control: once the card is restored, the same revert moves the test back"
            (t2/update! :model/Card :id archived-id {:archived false})
            (mt/user-http-request :crowberto :post 200 "revision/revert"
                                  {:entity "card-test" :id test-id :revision_id creation-id})
            (is (= archived-id (t2/select-one-fn :card_id :model/CardTest :id test-id))))
          (finally
            (t2/delete! :model/CardTest :id test-id)))))))

(deftest a-revert-to-a-state-that-an-edit-would-refuse-is-refused-card-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-temp [:model/Card {subject-id :id} (card)]
      ;; Created through the model, which does not validate, so that its creation revision has no inputs. A revision is
      ;; recorded only under a current user.
      (let [test-id     (mt/with-current-user (mt/user->id :crowberto)
                          (:id (first (data-testing.models.card-test/create-card-tests! [{:card_id      subject-id
                                                                                          :name         "No inputs"
                                                                                          :inputs       []
                                                                                          :expectations (mapv #(update % :type keyword) expectations)
                                                                                          :creator_id   (mt/user->id :crowberto)}]))))
            path        (str "ee/card-test/" test-id)
            creation-id (->> (mt/user-http-request :crowberto :get 200 (str "revision/card-test/" test-id))
                             (m/find-first :is_creation)
                             :id)]
        (try
          (is (pos-int? creation-id) "premise: the test has a creation revision")
          (mt/user-http-request :crowberto :put 200 path {:inputs inputs})
          (testing "control: an edit back to no inputs is refused"
            (is (=? {:error-code "card-test.missing-inputs"}
                    (mt/user-http-request :crowberto :put 400 path {:inputs []}))))
          (testing "a revert to the creation revision is refused the same way, and leaves the inputs"
            (is (=? {:error-code "card-test.missing-inputs"}
                    (mt/user-http-request :crowberto :post 400 "revision/revert"
                                          {:entity "card-test" :id test-id :revision_id creation-id})))
            (is (= 1 (count (:inputs (t2/select-one :model/CardTest :id test-id))))))
          (testing "a revert of the name alone is not validated, so it succeeds where an edit of the inputs is refused"
            (let [revision-id (-> (mt/user-http-request :crowberto :get 200 (str "revision/card-test/" test-id))
                                  first
                                  :id)]
              (mt/user-http-request :crowberto :put 200 path {:name "Renamed"})
              ;; The card now reads a column that the inputs lack.
              (t2/update! :model/Card :id subject-id
                          {:dataset_query (lib/native-query (mt/metadata-provider)
                                                            "SELECT ID, NAME, EMAIL FROM PUBLIC.PEOPLE")})
              (testing "premise: an edit of the inputs is refused"
                (is (=? {:error-code "card-test.missing-input-columns"}
                        (mt/user-http-request :crowberto :put 400 path {:inputs inputs}))))
              (mt/user-http-request :crowberto :post 200 "revision/revert"
                                    {:entity "card-test" :id test-id :revision_id revision-id})
              (is (= "No inputs" (t2/select-one-fn :name :model/CardTest :id test-id)))))
          (finally
            (t2/delete! :model/CardTest :id test-id)))))))
