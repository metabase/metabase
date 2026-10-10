(ns metabase-enterprise.snippet-collections.query-permissions-test
  "Snippets referenced by `:snippet` template tags are subject to the Snippet's read permissions when a user authors a
  query (ad-hoc queries and saving a Card), but not when running a saved Card, whose author vouched for them."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(def ^:private secret-content "1 AS one /* secret_snippet_content */")

(defn- snippet-query
  "A native query whose compiled SQL is just the content of the Snippet with `snippet-id`."
  [snippet-id]
  (mt/native-query
   {:query         "SELECT {{snippet: secret}}"
    :template-tags {"snippet: secret" {:id           "4e1d0d7c-6c4f-4f39-9a8d-3f1f1e0a0001"
                                       :name         "snippet: secret"
                                       :display-name "Snippet: secret"
                                       :type         :snippet
                                       :snippet-name "secret"
                                       :snippet-id   snippet-id}}}))

(defn- leaks-content? [response]
  (str/includes? (pr-str response) "secret_snippet_content"))

(defn- do-with-snippet-in-collection!
  "Run `(f snippet-id collection)` with a Snippet in a Snippet Collection that non-admins have no permissions on."
  [f]
  (mt/with-premium-features #{:snippet-collections}
    (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection         snippet-coll {:namespace "snippets"}
                       :model/NativeQuerySnippet {snippet-id :id} {:name          "secret"
                                                                   :content       secret-content
                                                                   :collection_id (:id snippet-coll)}]
          (f snippet-id snippet-coll))))))

(deftest ad-hoc-query-requires-snippet-read-perms-test
  (do-with-snippet-in-collection!
   (fn [snippet-id snippet-coll]
     (testing "an ad-hoc query referencing an unreadable Snippet is rejected without returning its content"
       (let [response (mt/user-http-request :rasta :post 403 "dataset" (snippet-query snippet-id))]
         (is (= "missing-required-permissions" (:error_type response)))
         (is (not (leaks-content? response)))))
     (testing "compiling the query to SQL is rejected too"
       (let [response (mt/user-http-request :rasta :post 403 "dataset/native" (snippet-query snippet-id))]
         (is (not (leaks-content? response)))))
     (testing "with read perms on the Snippet's collection the query runs"
       (perms/grant-collection-read-permissions! (perms-group/all-users) snippet-coll)
       (let [response (mt/user-http-request :rasta :post 202 "dataset" (snippet-query snippet-id))]
         (is (= "completed" (:status response)))
         (is (= [[1]] (mt/rows response))))))))

(defn- snippet-tag [snippet-id]
  {:lib/type     :mbql.stage/native
   :native       "SELECT {{snippet: x}}"
   :template-tags [{:id           (str (random-uuid))
                    :name         "snippet: x"
                    :display-name "Snippet: x"
                    :type         :snippet
                    :snippet-name "x"
                    :snippet-id   snippet-id}]})

(defn- same-tag-name-query
  "A query whose first stage uses `secret-snippet-id` and whose join's native stage uses `readable-snippet-id`, both
  under the template tag name `snippet: x`. Each stage is substituted from its own template tags."
  [secret-snippet-id readable-snippet-id]
  (let [value (fn [] [:value {:lib/uuid (str (random-uuid)), :effective-type :type/Integer} 1])]
    {:lib/type :mbql/query
     :database (mt/id)
     :stages   [(snippet-tag secret-snippet-id)
                {:lib/type :mbql.stage/mbql
                 :joins    [{:lib/type   :mbql/join
                             :alias      "J"
                             :strategy   :left-join
                             :conditions [[:= {:lib/uuid (str (random-uuid))} (value) (value)]]
                             :stages     [(snippet-tag readable-snippet-id)]}]}]}))

(deftest snippets-in-stages-sharing-a-tag-name-are-all-checked-test
  (testing "every native stage's Snippets are checked, even when two stages use the same template tag name"
    (do-with-snippet-in-collection!
     (fn [secret-snippet-id _snippet-coll]
       (mt/with-temp [:model/Collection         readable-coll {:namespace "snippets"}
                      :model/NativeQuerySnippet {readable-snippet-id :id} {:name          "readable"
                                                                           :content       "1 AS one"
                                                                           :collection_id (:id readable-coll)}
                      :model/Collection         card-coll {}]
         (perms/grant-collection-read-permissions! (perms-group/all-users) readable-coll)
         (perms/grant-collection-readwrite-permissions! (perms-group/all-users) card-coll)
         (let [query (same-tag-name-query secret-snippet-id readable-snippet-id)]
           (testing "ad-hoc"
             (is (not (leaks-content? (mt/user-http-request :rasta :post 403 "dataset" query)))))
           (testing "saving a Card"
             (mt/user-http-request :rasta :post 403 "card" {:name                   "snippet card"
                                                            :collection_id          (:id card-coll)
                                                            :display                "table"
                                                            :visualization_settings {}
                                                            :dataset_query          query}))))))))

(deftest save-card-requires-snippet-read-perms-test
  (do-with-snippet-in-collection!
   (fn [snippet-id snippet-coll]
     (mt/with-temp [:model/Collection card-coll {}
                    :model/Card       card      {:collection_id (:id card-coll)
                                                 :dataset_query (mt/native-query {:query "SELECT 1 AS one"})}]
       (perms/grant-collection-readwrite-permissions! (perms-group/all-users) card-coll)
       (let [card-body {:name                   "snippet card"
                        :collection_id          (:id card-coll)
                        :display                "table"
                        :visualization_settings {}
                        :dataset_query          (snippet-query snippet-id)}]
         (testing "creating a Card referencing an unreadable Snippet is rejected"
           (mt/user-http-request :rasta :post 403 "card" card-body))
         (testing "changing a Card's query to reference an unreadable Snippet is rejected"
           (mt/user-http-request :rasta :put 403 (str "card/" (:id card))
                                 {:dataset_query (snippet-query snippet-id)}))
         (testing "with read perms on the Snippet's collection both are allowed"
           (perms/grant-collection-read-permissions! (perms-group/all-users) snippet-coll)
           (mt/user-http-request :rasta :put 200 (str "card/" (:id card))
                                 {:dataset_query (snippet-query snippet-id)})
           (let [{new-card-id :id} (mt/user-http-request :rasta :post 200 "card" card-body)]
             (is (pos-int? new-card-id)))))))))

(deftest saved-card-runs-without-snippet-read-perms-test
  (testing "Running a saved Card does not require read perms on the Snippets it uses (#79364)"
    (do-with-snippet-in-collection!
     (fn [snippet-id _snippet-coll]
       (mt/with-temp [:model/Collection card-coll {}
                      :model/Card       card      {:collection_id (:id card-coll)
                                                   :dataset_query (snippet-query snippet-id)}]
         (perms/grant-collection-read-permissions! (perms-group/all-users) card-coll)
         (is (= [[1]]
                (mt/rows (mt/user-http-request :rasta :post 202 (format "card/%d/query" (:id card)))))))))))
