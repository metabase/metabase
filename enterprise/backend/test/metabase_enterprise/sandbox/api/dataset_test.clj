(ns metabase-enterprise.sandbox.api.dataset-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query   {:namespaces [metabase-enterprise.sandbox.api.dataset-test]}
                                                            metabase.test.data/native-query {:namespaces [metabase-enterprise.sandbox.api.dataset-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]))

(deftest dataset-parameter-test
  (testing "POST /api/dataset/parameter/values should respect sandboxing"
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (testing "with values_source_type=card"
        (mt/with-temp
          [:model/Card {source-card-id :id} {:database_id   (mt/id)
                                             :table_id      (mt/id :categories)
                                             :dataset_query (mt/mbql-query categories)}]
          (testing "when getting values"
            (let [get-values (fn [user]
                               (mt/user-http-request user :post 200 "/dataset/parameter/values"
                                                     {:parameter {:id                   "abc"
                                                                  :type                 "category"
                                                                  :name                 "CATEGORY"
                                                                  :values_source_type   "card"
                                                                  :values_source_config {:card_id     source-card-id
                                                                                         :value_field (mt/$ids $categories.name)}}}))]
              ;; returns much more if not sandboxed
              (is (> (-> (get-values :crowberto) :values count) 3))
              (is (=? {:values          [["African"] ["American"] ["Artisan"]]
                       :has_more_values false}
                      (get-values :rasta)))))
          (testing "when searching values"
            (let [search (fn [user]
                           (mt/user-http-request user :post 200 "/dataset/parameter/search/BBQ"
                                                 {:parameter {:id                   "abc"
                                                              :type                 "category"
                                                              :name                 "CATEGORY"
                                                              :values_source_type   "card"
                                                              :values_source_config {:card_id     source-card-id
                                                                                     :value_field (mt/$ids $categories.name)}}}))]
              ;; returns `BBQ` if not sandboxed
              (is (=? {:values          [["BBQ"]]
                       :has_more_values false}
                      (search :crowberto)))
              (is (=? {:values          []
                       :has_more_values false}
                      (search :rasta)))))))
      (testing "values_source_type=nil (values from fields)"
        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :post 200 "/dataset/parameter/values"
                                                   {:parameter {:id                 "abc"
                                                                :type               "category"
                                                                :name               "CATEGORY"
                                                                :values_source_type nil}
                                                    :field_ids [(mt/id :categories :name)]}))]
            ;; returns much more if not sandboxed
            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (=? {:values          [["Artisan"] ["African"] ["American"]]
                     :has_more_values false}
                    (get-values :rasta)))))
        (testing "when searching values"
          (let [search (fn [user]
                         (mt/user-http-request user :post 200 "/dataset/parameter/search/BBQ"
                                               {:parameter {:id                 "abc"
                                                            :type               "category"
                                                            :name               "CATEGORY"
                                                            :values_source_type nil}
                                                :field_ids [(mt/id :categories :name)]}))]
            ;; returns `BBQ` if not sandboxed
            (is (=? {:values [["BBQ"]]}
                    (search :crowberto)))
            (is (=? {:values          []}
                    (search :rasta)))))))))

(deftest sandboxed-query-native-form-test
  (testing "POST /api/dataset doesn't return the sandboxed compiled query or its params to a sandboxed user"
    ;; sandbox defs are thunks so `mt/id` resolves against the DB copy `with-gtaps-for-user!` creates
    (doseq [[sandbox-type sandbox-thunk attributes secrets]
            [[:remapping
              (fn []
                {:remappings {"price" ["variable" [:field (mt/id :venues :price) nil]]}})
              {"price" "1"}
              []]
             [:card
              (fn []
                {:query      (mt/native-query
                              {:query         (str "SELECT * FROM VENUES WHERE NAME <> {{secret_attr}} "
                                                   "AND 'SANDBOX-SQL-MARKER' <> ''")
                               :template-tags {"secret_attr" {:name         "secret_attr"
                                                              :display-name "secret_attr"
                                                              :type         "text"
                                                              :required     true
                                                              :id           "11111111-1111-1111-1111-111111111111"}}})
                 :remappings {"secret_attr" ["variable" ["template-tag" "secret_attr"]]}})
              {"secret_attr" "SECRET-ATTRIBUTE-VALUE"}
              ["SANDBOX-SQL-MARKER" "SECRET-ATTRIBUTE-VALUE"]]]]
      (testing sandbox-type
        (met/with-gtaps-for-user! :rasta
          {:gtaps      {:venues (sandbox-thunk)}
           :attributes attributes}
          (let [response (mt/user-http-request :rasta :post 202 "dataset" (mt/mbql-query venues {:limit 1}))]
            (is (= "completed" (:status response)))
            (is (nil? (get-in response [:data :native_form])))
            (doseq [secret secrets]
              (is (not (str/includes? (pr-str response) secret))))))))))

(deftest sandboxed-user-native-query-test
  (testing "A user with an enforced sandbox on a database can't use native queries there, even when their group grants
           native query access, because native queries bypass the sandbox"
    (met/with-gtaps! {:gtaps {:venues {:query (mt/mbql-query venues {:filter [:= $category_id 50]})}}}
      (perms/set-database-permission! &group (mt/id) :perms/create-queries :query-builder-and-native)
      (testing "POST /api/dataset refuses ad-hoc native SQL"
        (is (=? {:status "failed"
                 :error  "You do not have permissions to run this query."}
                (mt/user-http-request :rasta :post "dataset"
                                      (mt/native-query {:query "SELECT COUNT(*) FROM VENUES"})))))
      (testing "POST /api/dataset/native refuses to compile a query to SQL"
        (is (=? {:required-permissions {(mt/id) {:perms/create-queries "query-builder-and-native"}}
                 :message              "You do not have permissions to run this query."}
                (mt/user-http-request :rasta :post "dataset/native" (mt/mbql-query venues)))))
      (testing "MBQL queries are still sandboxed"
        (is (= [[10]]
               (mt/rows (mt/user-http-request :rasta :post 202 "dataset"
                                              (mt/mbql-query venues {:aggregation [[:count]]}))))))
      (testing "native queries are allowed when another group grants unrestricted access to the sandboxed table"
        (mt/with-temp [:model/PermissionsGroup           {other-group-id :id} {}
                       :model/PermissionsGroupMembership _ {:group_id other-group-id
                                                            :user_id  (mt/user->id :rasta)}]
          (perms/set-database-permission! other-group-id (mt/id) :perms/view-data :unrestricted)
          (is (= [[100]]
                 (mt/rows (mt/user-http-request :rasta :post 202 "dataset"
                                                (mt/native-query {:query "SELECT COUNT(*) FROM VENUES"}))))))))))

(def ^:private sandbox-secret-markers
  "Text that appears only in the sandbox definitions and attribute values of the tests below."
  ["SANDBOX-SQL-MARKER" "SECRET-ATTRIBUTE-VALUE"])

(defn- marker-card-sandbox
  "A sandbox for VENUES backed by a native Card whose SQL and attribute value hold [[sandbox-secret-markers]]. With
  `broken?`, the Card's SQL also references a column that does not exist, so every query against VENUES fails in the
  database."
  [broken?]
  {:query      (mt/native-query
                {:query         (str "SELECT * FROM VENUES WHERE NAME <> {{secret_attr}} "
                                     "AND 'SANDBOX-SQL-MARKER' <> ''"
                                     (when broken? " AND NO_SUCH_COLUMN = 1"))
                 :template-tags {"secret_attr" {:name         "secret_attr"
                                                :display-name "secret_attr"
                                                :type         "text"
                                                :required     true
                                                :id           "11111111-1111-1111-1111-111111111111"}}})
   :remappings {"secret_attr" ["variable" ["template-tag" "secret_attr"]]}})

(defn- internal-detail
  "The pieces of server-internal detail found anywhere in `response`: compiled SQL, sandbox definitions, and column
  fingerprints or stage metadata."
  [response]
  (let [s (pr-str response)]
    (into []
          (filter #(str/includes? s %))
          (concat sandbox-secret-markers
                  ["SELECT" "select " "fingerprint" "stage-metadata" "NO_SUCH_COLUMN"]))))

(defn- with-and-without-schema-checks
  "Call `f` once with `mu/defn` schema checks on (dev and test behavior) and once with them off (production behavior)."
  [f]
  (testing "with schema checks"
    (f))
  (testing "without schema checks (production)"
    (mu/disable-enforcement
      (f))))

(deftest sandboxed-query-error-hides-internal-detail-test
  (testing "A failed query's response does not show a sandboxed user the compiled SQL, the sandbox, or fingerprints"
    (met/with-gtaps-for-user! :rasta
      {:gtaps      {:venues (marker-card-sandbox false)}
       :attributes {"secret_attr" "SECRET-ATTRIBUTE-VALUE"}}
      (with-and-without-schema-checks
        (fn []
          (testing "control: a valid query runs under the sandbox"
            (is (=? {:status "completed", :row_count 1}
                    (mt/user-http-request :rasta :post 202 "dataset" (mt/mbql-query venues {:limit 1})))))
          (testing "a query that the database rejects"
            ;; H2 can't convert a venue's name to an integer, and quotes the SQL statement in its message
            (let [query    (mt/mbql-query venues {:filter [:= [:integer $name] 1]})
                  response (mt/user-http-request :rasta :post "dataset" query)]
              (is (=? {:status "failed", :error string?} response))
              (is (every? (comp string? :error) (:via response)))
              (is (= [] (internal-detail response)))
              (is (nil? (:preprocessed response)))
              (is (nil? (:native response)))
              (testing "control: an admin still sees the database's message"
                (is (=? {:status "failed", :error #"(?s).*SELECT.*"}
                        (mt/user-http-request :crowberto :post "dataset" query)))))))))))

(deftest broken-sandbox-error-hides-internal-detail-test
  (testing "When the sandbox's own SQL fails, the response does not show the sandboxed user that SQL"
    (met/with-gtaps-for-user! :rasta
      {:gtaps      {:venues (marker-card-sandbox true)}
       :attributes {"secret_attr" "SECRET-ATTRIBUTE-VALUE"}}
      (with-and-without-schema-checks
        (fn []
          (testing "POST /api/dataset"
            (let [response (mt/user-http-request :rasta :post "dataset" (mt/mbql-query venues {:limit 1}))]
              (is (=? {:status "failed", :error string?} response))
              (is (= [] (internal-detail response)))))
          (testing "GET /api/field/:id/summary"
            (let [response (mt/user-http-request :rasta :get (format "field/%d/summary" (mt/id :venues :price)))]
              (is (some? response))
              (is (= [] (internal-detail response)))))
          (testing "control: an admin is not sandboxed"
            (is (=? {:status "completed"}
                    (mt/user-http-request :crowberto :post 202 "dataset" (mt/mbql-query venues {:limit 1}))))))))))

(deftest sandboxed-query-schema-error-hides-fingerprints-test
  (testing "A query over a saved question with a bad join alias does not echo the question's column fingerprints"
    (met/with-gtaps-for-user! :rasta
      {:gtaps      {:venues {:remappings {"price" ["variable" [:field (mt/id :venues :price) nil]]}}}
       :attributes {"price" "1"}}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
        (with-and-without-schema-checks
          (fn []
            (let [query    {:database (mt/id)
                            :type     :query
                            :query    {:source-table (str "card__" card-id)
                                       :fields       [[:field (mt/id :venues :name) {:join-alias "Nope"}]]}}
                  response (mt/user-http-request :rasta :post "dataset" query)]
              (is (#{"completed" "failed"} (:status response)))
              (is (= [] (internal-detail (dissoc response :data)))))))))))
