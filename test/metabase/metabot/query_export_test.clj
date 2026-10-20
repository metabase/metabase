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
  "The source query [[query-export/transform-with-exportable-source]] leaves on a transform whose
  source is `query`, or nil when it withholds it."
  [query]
  (get-in (query-export/transform-with-exportable-source {:source {:type "query" :query query}})
          [:source :query]))

(deftest transform-source-withholds-native-sql-behind-a-later-stage-test
  (testing "a native stage under an MBQL stage is still native, so a check that could not be made
           withholds it instead of printing the SQL in the unresolved fallback"
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
  (testing "an orphaned transform keeps its source, which is what an admin repairs it from: there
           is no metadata left behind a deleted database to resolve anything against"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (t2/delete! :model/Database :id db-id)
      (mt/with-current-user (mt/user->id :crowberto)
        (is (str/includes? (str (rendered-source {:database db-id
                                                  :type     :native
                                                  :native   {:query "SELECT 1"}}))
                           "SELECT 1"))))))

(deftest transform-source-withholds-a-sandbox-hidden-field-test
  (testing "a source query that names a field that the user's sandbox hides is withheld, since
           exporting it would resolve that field's id to a name"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                    (lib/filter (lib/> (lib.metadata/field mp (mt/id :venues :price)) 1)))]
      (mt/with-current-user (mt/user->id :rasta)
        (is (string? (rendered-source query)))
        (mt/with-dynamic-fn-redefs [metabot.perms/sandbox-restricted-fields
                                    (fn [_table-ids] {(mt/id :venues) #{}})]
          (is (nil? (rendered-source query))))))))

(deftest transform-source-renders-an-unchecked-source-unresolved-test
  (testing "a source query whose permissions cannot be calculated still renders, but unresolved, so
           it names nothing that the user may not see"
    (mt/with-current-user (mt/user->id :rasta)
      (let [query {:lib/type :mbql/query
                   :database (mt/id)
                   :stages   [{:lib/type :mbql.stage/mbql :source-card 13371337}]}]
        (is (:unchecked? (shared.content-store/query-for-export query false)))
        (is (str/includes? (str (rendered-source query)) ":source-card 13371337"))))))

(deftest transform-source-withholds-unchecked-legacy-native-sql-test
  (testing "native SQL in the legacy format stays out when the check could not run"
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
