(ns metabase.metabot.query-export-test
  "Tests for the gate on a transform's stored source query: what the model may see of it, and in
  what form. `read_resource` renders `metabase://transform/{id}` through it."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.query-export :as query-export]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- rendered-source
  "The source query [[query-export/transform-with-exportable-source]] leaves on a transform whose
  source is `query`, or nil when it withholds it."
  [query]
  (get-in (query-export/transform-with-exportable-source {:source {:type "query" :query query}})
          [:source :query]))

(deftest transform-source-sandboxed-field-test
  (testing "a source query naming a field the user's sandbox hides is withheld, since exporting it
           would resolve that field's id to a name"
    (let [query (-> (lib/query (mt/metadata-provider)
                               (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))
                    (lib/filter (lib/> (lib.metadata/field (mt/metadata-provider) (mt/id :venues :price)) 1)))]
      (mt/with-current-user (mt/user->id :rasta)
        (is (some? (rendered-source query)))
        (mt/with-dynamic-fn-redefs [metabot.perms/sandbox-restricted-fields (fn [_table-ids] {(mt/id :venues) #{}})]
          (is (nil? (rendered-source query))))))))

(deftest transform-source-unpermissionable-source-test
  (testing "a source query whose permissions cannot be calculated at all still renders, since that is
           not a refusal - it just renders unresolved, naming nothing the user may not see"
    (mt/with-current-user (mt/user->id :rasta)
      (let [text (rendered-source {:lib/type :mbql/query
                                   :database (mt/id)
                                   :stages   [{:lib/type :mbql.stage/mbql :source-card 13371337}]})]
        (is (some? text))
        (is (str/includes? text ":source-card 13371337")
            "the card id is still a number, so nothing was resolved to a name")))))

(deftest transform-source-unpermissionable-native-source-test
  (testing "native SQL stays out when the check could not run, since its table and column names are
           already plain text and having no provider hides nothing"
    (mt/with-current-user (mt/user->id :rasta)
      (is (nil? (rendered-source
                 {:database (mt/id)
                  :type     :native
                  :native   {:query         "SELECT * FROM {{snip}}"
                             :template-tags {"snip" {:type         :snippet
                                                     :name         "snip"
                                                     :display-name "snip"
                                                     :snippet-id   Integer/MAX_VALUE}}}}))))))

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
