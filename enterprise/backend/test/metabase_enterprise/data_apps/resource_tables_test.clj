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
                                    :dataset_query (native "SELECT * FROM checkins WHERE 1=1 [[AND venue_id IN (SELECT id FROM venues WHERE name = {{name}})]]")}]
        (is (= (sort [(mt/id :venues) (mt/id :checkins)])
               (resource-tables/collection-table-ids collection-id)))))))
