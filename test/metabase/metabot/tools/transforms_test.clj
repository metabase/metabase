(ns metabase.metabot.tools.transforms-test
  "Tests for reading transform definitions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.query-export :as query-export]
   [metabase.metabot.tools.transforms :as agent-transforms]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

;;; ----------------------------------- read tool integration tests ---------------------------------------------------

(def ^:private gadget-sql
  "SELECT * FROM products WHERE price < 100 AND category <> 'Widget'")

(deftest get-transform-details-native-query-test
  (mt/with-premium-features #{:transforms-basic :transforms-python :hosting}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:name   "Gadget Products"
                      :source {:type  "query"
                               :query (lib/native-query (mt/metadata-provider) gadget-sql)}}]
        (let [{:keys [output]} (agent-transforms/get-transform-details-tool {:transform_id transform-id})]
          (is (str/includes? output "name=\"Gadget Products\""))
          (is (str/includes? output "<source type=\"query\">"))
          (is (str/includes? output (str "<query>" gadget-sql "</query>"))))))))

(deftest get-transform-details-notebook-query-test
  (mt/with-premium-features #{:transforms-basic :transforms-python :hosting}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:name   "Notebook Products"
                      :source {:type  "query"
                               :query (lib/query (mt/metadata-provider)
                                                 (lib.metadata/table (mt/metadata-provider) (mt/id :products)))}}]
        (let [{:keys [output]} (agent-transforms/get-transform-details-tool {:transform_id transform-id})]
          (is (str/includes? output "<query>\n```json"))
          (is (str/includes? output "```\n</query>"))
          (let [exported (json/decode (second (re-find #"(?s)```json\n(.*)\n```" output)))]
            (is (= [(:name (lib.metadata/database (mt/metadata-provider))) "PUBLIC" "PRODUCTS"]
                   (get-in exported ["stages" 0 "source-table"])))
            (is (not-any? #(and (map? %) (contains? % "lib/metadata"))
                          (tree-seq coll? seq exported)))))))))

(defn- query-transform-details!
  "`get_transform_details` output for a transform whose source is `query`, read as rasta with query
  access to the whole database - so `transforms/get-transform` passes and whatever happens to the
  source is the export gate's doing."
  [query]
  (mt/with-premium-features #{:transforms-basic :transforms-python :hosting}
    (mt/with-temp [:model/Transform {transform-id :id}
                   {:name "Orders Rollup" :source {:type "query" :query query}}]
      (mt/with-data-analyst-role! (mt/user->id :rasta)
        (mt/with-current-user (mt/user->id :rasta)
          (:output (agent-transforms/get-transform-details-tool {:transform_id transform-id})))))))

(deftest get-transform-details-sandboxed-field-test
  (testing "a source query naming a field the user's sandbox hides renders without its query, since
           exporting it would resolve that field's id to a name"
    (let [query (-> (lib/query (mt/metadata-provider)
                               (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))
                    (lib/filter (lib/> (lib.metadata/field (mt/metadata-provider) (mt/id :venues :price)) 1)))]
      (is (str/includes? (query-transform-details! query) "<query>"))
      (mt/with-dynamic-fn-redefs [metabot.perms/sandbox-restricted-fields (fn [_table-ids] {(mt/id :venues) #{}})]
        (is (not (str/includes? (query-transform-details! query) "<query>")))))))

(deftest get-transform-details-unpermissionable-source-test
  (testing "a source query whose permissions cannot be calculated at all still renders, since that is
           not a refusal - it just renders unresolved, naming nothing the user may not see"
    (let [output (query-transform-details! {:database (mt/id)
                                            :type     :query
                                            :query    {:source-table "card__13371337"}})]
      (is (str/includes? output "<query>"))
      (is (str/includes? output ":source-card 13371337")
          "the card id is still a number, so nothing was resolved to a name"))))

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

(deftest get-transform-details-unpermissionable-native-source-test
  (testing "native SQL stays out when the check could not run, since its table and column names are
           already plain text and having no provider hides nothing"
    (let [output (query-transform-details!
                  {:database (mt/id)
                   :type     :native
                   :native   {:query         "SELECT * FROM {{snip}}"
                              :template-tags {"snip" {:type         :snippet
                                                      :name         "snip"
                                                      :display-name "snip"
                                                      :snippet-id   Integer/MAX_VALUE}}}})]
      (is (not (str/includes? output "<query>")))
      (is (not (str/includes? output "SELECT"))))))

(deftest get-transform-details-source-permission-test
  (testing "transforms/get-transform refuses a transform whose stored query the user cannot run, even
           with query access to another table in its database, so the tool never reaches the source"
    (mt/with-premium-features #{:transforms-basic :transforms-python :hosting}
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:name   "Orders Rollup"
                      :source {:type  "query"
                               :query (lib/query (mt/metadata-provider)
                                                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
        (mt/with-data-analyst-role! (mt/user->id :rasta)
          (mt/with-no-data-perms-for-all-users!
            (perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/view-data :unrestricted)
            (perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/create-queries :query-builder)
            (mt/with-current-user (mt/user->id :rasta)
              (is (=? {:status-code 403 :output "You don't have permissions to do that."}
                      (agent-transforms/get-transform-details-tool {:transform_id transform-id}))))
            (testing "and the query renders once the source table is granted"
              (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/view-data :unrestricted)
              (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/create-queries :query-builder)
              (mt/with-current-user (mt/user->id :rasta)
                (is (str/includes? (:output (agent-transforms/get-transform-details-tool {:transform_id transform-id}))
                                   "<query>"))))))))))

(deftest get-transform-details-python-source-test
  (mt/with-premium-features #{:transforms-basic :transforms-python :hosting}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:name   "Gadget Metrics"
                      :source {:type            "python"
                               :source-database (mt/id)
                               :body            "import pandas as pd"}}]
        (let [{:keys [output]} (agent-transforms/get-transform-details-tool {:transform_id transform-id})]
          (is (str/includes? output "<source type=\"python\">"))
          (is (str/includes? output "<body>import pandas as pd</body>"))
          (is (str/includes? output (str "<database>" (mt/id) "</database>"))))))))

(deftest get-transform-details-source-card-permission-test
  (mt/with-premium-features #{:transforms-basic :transforms-python :hosting}
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-full-data-perms-for-all-users!
        (mt/with-data-analyst-role! (mt/user->id :rasta)
          (mt/with-temp [:model/Collection {collection-id :id} {}
                         :model/Card       {card-id :id}
                         {:collection_id collection-id
                          :database_id   (mt/id)
                          :dataset_query (lib/query (mt/metadata-provider)
                                                    (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}
                         :model/Transform {transform-id :id}
                         {:name   "Private source Card"
                          :source {:type  "query"
                                   :query (lib/query (mt/metadata-provider)
                                                     (lib.metadata/card (mt/metadata-provider) card-id))}}]
            (mt/with-current-user (mt/user->id :rasta)
              (let [{:keys [output status-code]} (agent-transforms/get-transform-details-tool {:transform_id transform-id})]
                (is (= 403 status-code))
                (is (= "You don't have permissions to do that." output))))))))))
