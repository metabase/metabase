(ns metabase.metabot.query-export-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.query-export :as query-export]
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- rendered-source
  "Return the exported query for a transform, or nil if export is denied."
  [query]
  (get-in (query-export/transform-with-exportable-source {:source {:type "query" :query query}})
          [:source :query]))

(deftest transform-source-withholds-native-sql-behind-a-later-stage-test
  (testing "native SQL is withheld if its permissions cannot be checked, even when an MBQL stage follows it"
    (let [native-stage {:lib/type      :mbql.stage/native
                        :native        "SELECT * FROM {{snip}}"
                        :template-tags {"snip" {:type         :snippet
                                                :name         "snip"
                                                :display-name "snip"
                                                :snippet-id   Integer/MAX_VALUE}}}]
      (mt/with-current-user (mt/user->id :rasta)
        (doseq [stages [[native-stage] [native-stage {:lib/type :mbql.stage/mbql}]]]
          (is (nil? (rendered-source {:lib/type :mbql/query :database (mt/id) :stages stages}))
              (str (count stages) " stage(s)")))))))

(deftest transform-source-survives-a-deleted-source-database-test
  (testing "a transform keeps its source after its database is deleted so that an admin can repair it"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (t2/delete! :model/Database :id db-id)
      (mt/with-current-user (mt/user->id :crowberto)
        (is (str/includes? (str (rendered-source {:database db-id
                                                  :type     :native
                                                  :native   {:query "SELECT 1"}}))
                           "SELECT 1"))))))

(deftest transform-source-withholds-a-sandbox-hidden-field-test
  (testing "a source query is withheld if it uses a field hidden by the user's sandbox"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                    (lib/filter (lib/> (lib.metadata/field mp (mt/id :venues :price)) 1)))]
      (mt/with-current-user (mt/user->id :rasta)
        (is (string? (rendered-source query)))
        (mt/with-dynamic-fn-redefs [metabot.perms/sandbox-restricted-fields
                                    (fn [_table-ids] {(mt/id :venues) #{}})]
          (is (nil? (rendered-source query))))))))

(deftest transform-source-renders-an-unchecked-source-unresolved-test
  (testing "a source query keeps its IDs unresolved if its permissions cannot be checked"
    (mt/with-current-user (mt/user->id :rasta)
      (let [query {:lib/type :mbql/query
                   :database (mt/id)
                   :stages   [{:lib/type :mbql.stage/mbql :source-card 13371337}]}]
        (is (:unchecked? (shared.content-store/query-for-export query false)))
        (is (str/includes? (str (rendered-source query)) ":source-card 13371337"))))))

(deftest transform-source-withholds-unchecked-legacy-native-sql-test
  (testing "native SQL in the legacy format is withheld if its permissions cannot be checked"
    (let [query {:database (mt/id)
                 :type     :native
                 :native   {:query         "SELECT * FROM {{snip}}"
                            :template-tags {"snip" {:type         :snippet
                                                    :name         "snip"
                                                    :display-name "snip"
                                                    :snippet-id   Integer/MAX_VALUE}}}}]
      (mt/with-current-user (mt/user->id :rasta)
        (is (:unchecked? (shared.content-store/query-for-export query false)))
        (is (nil? (rendered-source query)))))))
