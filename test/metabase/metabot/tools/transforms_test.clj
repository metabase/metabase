(ns metabase.metabot.tools.transforms-test
  "Tests for reading transform definitions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.transforms :as agent-transforms]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

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
