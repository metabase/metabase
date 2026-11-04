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
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- rendered-source
  "Return the exported query for a transform, or nil if export is denied."
  [query]
  (get-in (query-export/transform-with-exportable-source {:source {:type :query :query query}})
          [:source :query]))

(defn- snippet-query
  []
  (-> (lib/native-query (mt/metadata-provider) "SELECT * FROM {{snip}}")
      (lib/with-template-tags {"snip" {:type         :snippet
                                       :name         "snip"
                                       :display-name "snip"
                                       :snippet-id   Integer/MAX_VALUE
                                       :snippet-name "snip"}})))

(deftest transform-source-withholds-native-sql-behind-a-later-stage-test
  (testing "native SQL is withheld if its permissions cannot be checked, even when an MBQL stage follows it"
    (mt/with-current-user (mt/user->id :rasta)
      (doseq [query [(snippet-query) (lib/append-stage (snippet-query))]]
        (is (nil? (rendered-source query))
            (str (lib/stage-count query) " stage(s)"))))))

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

(deftest transform-source-renders-portable-mbql-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :products)))]
      (is (:mp (shared.content-store/query-for-export query false)))
      (let [exported (json/decode (second (re-find #"(?s)```json\n(.*)\n```" (rendered-source query))))]
        (is (= [(:name (lib.metadata/database mp)) "PUBLIC" "PRODUCTS"]
               (get-in exported ["stages" 0 "source-table"])))
        (is (not-any? #(and (map? %) (contains? % "lib/metadata"))
                      (tree-seq coll? seq exported)))))))

(deftest transform-source-renders-an-unchecked-source-unresolved-test
  (testing "a source query keeps its IDs unresolved if its permissions cannot be checked"
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [mp    (mt/metadata-provider)
              query (lib/query mp (lib.metadata/card mp card-id))]
          (t2/delete! :model/Card :id card-id)
          (is (:unchecked? (shared.content-store/query-for-export query false)))
          (is (str/includes? (str (rendered-source query)) (str ":source-card " card-id))))))))

(deftest transform-source-withholds-unchecked-legacy-native-sql-test
  (testing "native SQL in the legacy format is withheld if its permissions cannot be checked"
    (let [query (lib/->legacy-MBQL (snippet-query))]
      (mt/with-current-user (mt/user->id :rasta)
        (is (:unchecked? (shared.content-store/query-for-export query false)))
        (is (nil? (rendered-source query)))))))
