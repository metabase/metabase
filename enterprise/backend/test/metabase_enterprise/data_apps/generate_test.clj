(ns metabase-enterprise.data-apps.generate-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private collection-entity-id "AppCollection12345678")

(deftest generate-schema-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (testing "a non-superuser cannot generate an app's files"
        (mt/user-http-request :rasta :get 403 "ee/apps/generate/schema"))
      (let [[{:keys [path contents]} :as files] (mt/user-http-request :crowberto :get 200 "ee/apps/generate/schema")]
        (is (= 1 (count files)))
        (is (= "src/metabase.schema.ts" path))
        (testing "the schema holds the published tables with their fields, and the Library's metrics"
          (is (str/includes? contents "const tables = {"))
          (is (str/includes? contents (str "id: " (mt/id :venues))))
          (is (str/includes? contents (str "fieldId: " (mt/id :venues :name))))
          (is (str/includes? contents "const metrics = {")))
        (testing "and no actions"
          (is (not (str/includes? contents "actions"))))))))

(deftest generate-queries-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (let [definition {:entityId "VenuesByCategory12345"
                        :query    {:stages [{:source       {:type "table" :id (mt/id :venues) :name "Venues"}
                                             :aggregations [{:type "operator" :operator "count" :args []}]
                                             :breakouts    [{:type        "column"
                                                             :name        "CATEGORY_ID"
                                                             :fieldId     (mt/id :venues :category_id)
                                                             :displayName "Category ID"
                                                             :jsType      "number"}]}]}}
            [{:keys [path contents]} :as files]
            (mt/user-http-request :crowberto :post 200 "ee/apps/generate/queries"
                                  {:collection collection-entity-id
                                   :queries    {:venuesByCategory definition}})]
        (is (= 1 (count files)))
        (testing "a question is named after its export and filed in the app's collection by its entity ID"
          (is (= "venuesbycategory.yaml" path))
          (is (str/includes? contents "name: venuesByCategory\n"))
          (is (str/includes? contents "entity_id: VenuesByCategory12345\n"))
          (is (str/includes? contents (str "collection_id: " collection-entity-id "\n"))))
        (testing "its query is the definition's, with portable references"
          (is (str/includes? contents "- count"))
          (is (str/includes? contents "- CATEGORY_ID")))))))

(deftest generate-actions-test
  (mt/with-premium-features #{:data-apps}
    (let [[{:keys [path contents]} :as files]
          (mt/user-http-request :crowberto :post 200 "ee/apps/generate/actions"
                                {:collection collection-entity-id
                                 :actions    {:updateVenue {:entityId "UpdateVenue1234567890"
                                                            :kind     "row/update"
                                                            :table    {:id (mt/id :venues) :name "Venues"}}}})]
      (is (= 1 (count files)))
      (testing "an implicit action is named after its export and filed in the app's collection by its entity ID"
        (is (= "updatevenue.yaml" path))
        (is (str/includes? contents "name: updateVenue\n"))
        (is (str/includes? contents "entity_id: UpdateVenue1234567890\n"))
        (is (str/includes? contents (str "collection_id: " collection-entity-id "\n")))
        (is (str/includes? contents "type: implicit\n"))
        (is (str/includes? contents "kind: row/update"))
        (is (str/includes? contents "- VENUES"))))))
