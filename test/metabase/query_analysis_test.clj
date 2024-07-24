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

(deftest native-query-enabled-test
  (mt/discard-setting-changes [sql-parsing-enabled]
    (testing "sql parsing enabled"
      (public-settings/sql-parsing-enabled! true)
      (is (true? (query-analysis/enabled-type? :native))))
    (testing "sql parsing disabled"
      (public-settings/sql-parsing-enabled! false)
      (is (false? (query-analysis/enabled-type? :native))))))

(deftest non-native-query-enabled-test
  (testing "mbql parsing is always enabled"
    (is (query-analysis/enabled-type? :query))
    (is (query-analysis/enabled-type? :mbql/query)))
  (testing "other types are disabled"
    (is (false? (query-analysis/enabled-type? :unexpected)))))

(defn- field-id-references [card-or-query]
  (into #{}
        (map :field-id)
        (#'query-analysis/query-references
         (:dataset_query card-or-query card-or-query))))

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
       (is (= #{%venues.name %venues.price} (field-id-references c1)))
       (is (empty? (field-id-references c2)))
       (is (= #{%venues.id %checkins.venue_id} (field-id-references c3))))))
  (testing "Parsing pMBQL query returns correct used fields"
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          venues            (lib.metadata/table metadata-provider (mt/id :venues))
          venues-name       (lib.metadata/field metadata-provider (mt/id :venues :name))
          mlv2-query        (-> (lib/query metadata-provider venues)
                                (lib/aggregate (lib/distinct venues-name)))]
      (is (= #{(mt/id :venues :name)}
             (field-id-references mlv2-query))))))

(deftest replace-fields-and-tables!-test
  (testing "fields and tables in a native card can be replaced"
    (t2.with-temp/with-temp [:model/Card card {:dataset_query (mt/native-query {:query "SELECT TOTAL FROM ORDERS"})}]
      (let [replacements {:fields {(mt/id :orders :total) (mt/id :people :name)}
                          :tables {(mt/id :orders) (mt/id :people)}}]
        (is (= "SELECT NAME FROM PEOPLE"
               (query-analysis/replace-fields-and-tables card replacements)))))))
