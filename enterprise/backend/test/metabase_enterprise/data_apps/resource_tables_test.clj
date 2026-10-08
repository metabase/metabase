(ns metabase-enterprise.data-apps.resource-tables-test
  "The tables a data app's resources read, recorded for the permission warnings an admin sees."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.resource-tables :as resource-tables]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest a-table-in-an-optional-clause-is-recorded-test
  (testing "an optional clause is ordinary query syntax that a parser doesn't read, and the tables inside it are read
            like the ones outside"
    (let [native (fn [sql] (lib/native-query (mt/metadata-provider) sql))]
      (mt/with-temp [:model/Collection {collection-id :id} {:namespace :data-apps}
                     :model/Card _ {:collection_id collection-id
                                    :dataset_query (native "SELECT * FROM venues WHERE 1=1 [[AND name = {{name}}]]")}
                     :model/Card _ {:collection_id collection-id
                                    :dataset_query (native "SELECT * FROM venues v [[JOIN checkins c ON c.venue_id = v.id AND c.id = {{id}}]]")}]
        (is (= (sort [(mt/id :venues) (mt/id :checkins)])
               (resource-tables/collection-table-ids collection-id))
            "checkins is named only inside the optional clause")))))

(deftest a-table-joined-to-a-card-tag-is-recorded-test
  (testing "a card tag stands where a table does, and the parser reads the query around it"
    (let [native (fn [sql] (lib/native-query (mt/metadata-provider) sql))]
      (mt/with-temp [:model/Collection {collection-id :id} {:namespace :data-apps}
                     :model/Card {venues-id :id} {:collection_id collection-id
                                                  :dataset_query (native "SELECT * FROM venues")}
                     :model/Card _ {:collection_id collection-id
                                    :dataset_query (native (format "SELECT * FROM {{#%d}} x JOIN checkins c ON c.venue_id = x.id" venues-id))}]
        (is (= (sort [(mt/id :venues) (mt/id :checkins)])
               (resource-tables/collection-table-ids collection-id)))))))
