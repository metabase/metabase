(ns metabase.query-analysis-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models :refer [Card]]
   [metabase.public-settings :as public-settings]
   [metabase.query-analysis :as query-analysis]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest legacy-sql-parsing-enabled-test
  (mt/discard-setting-changes [query-analysis-native-disabled sql-parsing-enabled]
    (testing "legacy setting enabled"
      (public-settings/sql-parsing-enabled! true)
      ;; I'm not sure why this is `nil`, but it is fine for our purposes.
      (is (nil? (public-settings/query-analysis-native-disabled)))
      (public-settings/query-analysis-native-disabled! true)
      (is (true? (public-settings/query-analysis-native-disabled)))))
  (mt/discard-setting-changes [query-analysis-native-disabled sql-parsing-enabled]
    (testing "legacy setting disabled"
      (public-settings/sql-parsing-enabled! false)
      (is (true? (public-settings/query-analysis-native-disabled)))
      (public-settings/query-analysis-native-disabled! false)
      (is (false? (public-settings/query-analysis-native-disabled))))))

(deftest native-query-enabled-test
  (mt/discard-setting-changes [query-analysis-enabled
                               query-analysis-native-disabled]
    (public-settings/query-analysis-enabled! true)
    (testing "sql parsing enabled"
      (public-settings/query-analysis-native-disabled! false)
      (is (true? (query-analysis/enabled-type? :native))))
    (testing "sql parsing disabled"
      (public-settings/query-analysis-native-disabled! true)
      (is (false? (query-analysis/enabled-type? :native))))))

(deftest non-native-query-enabled-test
  (mt/discard-setting-changes [query-analysis-enabled
                               query-analysis-mbql-disabled]
    (public-settings/query-analysis-enabled! true)
    (testing "mbql parsing enabled"
      (public-settings/query-analysis-mbql-disabled! false)
      (is (true? (query-analysis/enabled-type? :query)))
      (is (true? (query-analysis/enabled-type? :mbql/query))))
    (testing "mbql parsing disabled"
      (public-settings/query-analysis-mbql-disabled! true)
      (is (false? (query-analysis/enabled-type? :query)))
      (is (false? (query-analysis/enabled-type? :mbql/query))))))

(deftest other-query-type-enabled-test
  (mt/discard-setting-changes [query-analysis-enabled]
    (public-settings/query-analysis-enabled! true)
    (testing "all other query types are disabled"
      (is (false? (query-analysis/enabled-type? :unexpected))))))

(deftest no-query-analysis-enabled-test
  (mt/discard-setting-changes [query-analysis-enabled
                               query-analysis-mbql-disabled
                               query-analysis-native-disabled]
    (public-settings/query-analysis-enabled! false)
    (testing "All query analysis is disabled"
      (public-settings/query-analysis-native-disabled! false)
      (public-settings/query-analysis-mbql-disabled! false)
      (is (false? (query-analysis/enabled-type? :native)))
      (is (false? (query-analysis/enabled-type? :query)))
      (is (false? (query-analysis/enabled-type? :mbql/query))))))

(deftest parse-mbql-test
  (testing "Parsing MBQL query returns correct used fields"
    (mt/with-temp [Card c1 {:dataset_query (mt/mbql-query venues
                                             {:aggregation [[:distinct $name]
                                                            [:distinct $price]]
                                              :limit       5})}
                   Card c2 {:dataset_query {:query    {:source-table (str "card__" (:id c1))}
                                            :database (:id (mt/db))
                                            :type     :query}}
                   Card c3 {:dataset_query (mt/mbql-query checkins
                                             {:joins [{:source-table (str "card__" (:id c2))
                                                       :alias        "Venues"
                                                       :condition    [:= $checkins.venue_id $venues.id]}]})}]
      (mt/$ids
       (is (= {:explicit #{%venues.name %venues.price}}
              (#'query-analysis/query-field-ids (:dataset_query c1))))
       (is (= {:explicit nil}
              (#'query-analysis/query-field-ids (:dataset_query c2))))
       (is (= {:explicit #{%venues.id %checkins.venue_id}}
              (#'query-analysis/query-field-ids (:dataset_query c3)))))))
  (testing "Parsing pMBQL query returns correct used fields"
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          venues            (lib.metadata/table metadata-provider (mt/id :venues))
          venues-name       (lib.metadata/field metadata-provider (mt/id :venues :name))
          mlv2-query        (-> (lib/query metadata-provider venues)
                                (lib/aggregate (lib/distinct venues-name)))]
      (is (= {:explicit #{(mt/id :venues :name)}}
             (#'query-analysis/query-field-ids mlv2-query))))))

(deftest replace-fields-and-tables!-test
  (testing "fields and tables in a native card can be replaced"
    (t2.with-temp/with-temp [:model/Card card {:dataset_query (mt/native-query {:query "SELECT TOTAL FROM ORDERS"})}]
      (let [replacements {:fields {(mt/id :orders :total) (mt/id :people :name)}
                          :tables {(mt/id :orders) (mt/id :people)}}]
        (is (= "SELECT NAME FROM PEOPLE"
               (query-analysis/replace-fields-and-tables card replacements)))))))
