(ns metabase.query-analysis-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models :refer [Card]]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.public-settings :as public-settings]
   [metabase.query-analysis :as query-analysis]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
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
  (-> (:dataset_query card-or-query card-or-query)
      (#'query-analysis/query-references)
      (update-vals
       (fn [refs]
         (->> refs
              ;; lowercase names to avoid tests being driver-dependent
              (map #(-> %
                        (u/update-if-exists :schema u/lower-case-en)
                        (update :table u/lower-case-en)
                        (u/update-if-exists :column u/lower-case-en)))
              (sort-by (juxt :table :column)))))))

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
      (is (= (mt/$ids
               [{:table-id (mt/id :venues), :table "venues", :field-id %venues.name, :column "name", :explicit-reference true}
                {:table-id (mt/id :venues), :table "venues", :field-id %venues.price, :column "price", :explicit-reference true}])
             (:fields (field-id-references c1))))
      (is (empty? (:fields (field-id-references c2))))
      (is (= (mt/$ids
               [{:table-id (mt/id :checkins), :table "checkins", :field-id %checkins.venue_id, :column "venue_id", :explicit-reference true}
                {:table-id (mt/id :venues), :table "venues", :field-id %venues.id, :column "id", :explicit-reference true}])
             (:fields (field-id-references c3))))))
  (testing "Parsing pMBQL query returns correct used fields"
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          venues            (lib.metadata/table metadata-provider (mt/id :venues))
          venues-name       (lib.metadata/field metadata-provider (mt/id :venues :name))
          mlv2-query        (-> (lib/query metadata-provider venues)
                                (lib/aggregate (lib/distinct venues-name)))]
      (is (= [{:table-id (mt/id :venues)
               :table "venues"
               :field-id (mt/id :venues :name)
               :column "name"
               :explicit-reference true}]
             (:fields (field-id-references mlv2-query)))))))

(deftest parse-native-test
  (testing "Parsing Native queries that reference models do not return cache tables"
    (mt/with-temp [Card c1 {:type          :model
                            :dataset_query (mt/mbql-query venues
                                             {:aggregation [[:distinct $name]
                                                            [:distinct $price]]
                                              :limit       5})}
                   Card c2 {:dataset_query (let [tag-name (str "#" (:id c1) "-some-card")]
                                             (mt/native-query {:query         (format "SELECT * FROM t JOIN {{%s}} ON true" tag-name)
                                                               :template-tags {tag-name {:name         tag-name
                                                                                         :display-name tag-name
                                                                                         :type         "card"
                                                                                         :card-id      (:id c1)}}}))}]
        ;; TODO extract model persistence logic from the task, so that we can use the module API for this
      (let [pi (persisted-info/turn-on-model! (t2/select-one-pk :model/User) c1)]
        (t2/update! :model/PersistedInfo (:id pi) {:active true
                                                   :state "persisted"
                                                   :query_hash (persisted-info/query-hash (:dataset_query c1))
                                                   :definition (persisted-info/metadata->definition (:result_metadata c1) (:table_name pi))
                                                   :state_change_at :%now
                                                   :refresh_end :%now}))

      (is (= [{:table "t"}]
             (:tables (field-id-references c2)))))))

(deftest replace-fields-and-tables!-test
  (testing "fields and tables in a native card can be replaced"
    (t2.with-temp/with-temp [:model/Card card {:dataset_query (mt/native-query {:query "SELECT TOTAL FROM ORDERS"})}]
      (let [replacements {:fields {(mt/id :orders :total) (mt/id :people :name)}
                          :tables {(mt/id :orders) (mt/id :people)}}]
        (is (= "SELECT NAME FROM PEOPLE"
               (query-analysis/replace-fields-and-tables card replacements)))))))

(defn- monstrous-name []
  (str/replace (apply str (repeatedly 10 random-uuid)) "-" "_"))

(defmacro with-analysis-on [& body]
  `(mt/with-dynamic-redefs [query-analysis/enabled-type? (constantly true)]
     (query-analysis/with-immediate-analysis
       ~@body)))

(deftest parse-crosstab-test
  (with-analysis-on
    (testing "Nested queries within crosstab expressions are ignored"
      (let [sql "SELECT * FROM CROSSTAB($$ wat $$, $$ wut $$) AS ct(page INTEGER, \"foo\" FLOAT)"]
        (mt/with-temp [Card {c-id :id} {:dataset_query (mt/native-query {:query sql})}]
          (testing "We record that analysis was successful"
            (is (t2/exists? :model/QueryAnalysis :card_id c-id)))
          (testing "But there are no identifiers saved to the database"
            (is (not (t2/exists? :model/QueryField :card_id c-id)))
            (is (not (t2/exists? :model/QueryTable :card_id c-id)))))))))

(deftest parse-long-column-test
  (with-analysis-on
    (testing "Long identifiers are truncated"
      (let [long-column (monstrous-name)
            long-table  (monstrous-name)]
        (mt/with-temp [Card {c-id :id} {:dataset_query (mt/native-query {:query (format "SELECT c, %s FROM t, %s"
                                                                                        long-column
                                                                                        long-table)})}]
          (let [columns (t2/select-fn-set :column :model/QueryField :card_id c-id)
                tables  (t2/select-fn-set :table :model/QueryTable :card_id c-id)]
            (is (= 2 (count columns)))
            (is (contains? columns "c"))
            (is (some (partial str/starts-with? long-column) columns))
            (is (= 2 (count tables)))
            (is (contains? tables "t"))
            (is (some (partial str/starts-with? long-table) tables))))))))

(deftest analysis-error-test
  (with-analysis-on
    (testing "Errors analyzing queries will not prevent cards being created or updated"
      (mt/with-dynamic-redefs [query-analysis/update-query-analysis-for-card! (fn [& _] (throw (ex-info "Oh no!" {})))]
        (mt/with-temp [Card {c-id :id} {:dataset_query (mt/native-query {:query "SELECT c FROM t"})}]
          (testing "The card was created"
            (is (t2/exists? :model/Card c-id)))
          (testing "The analysis was not"
            (is (not (t2/exists? :model/QueryAnalysis :card_id c-id)))
            (is (not (t2/exists? :model/QueryField :card_id c-id)))
            (is (not (t2/exists? :model/QueryTable :card_id c-id))))
          (testing "We can also update it"
            (t2/update! :model/Card c-id {:name "Spiffy"})
            (is (= "Spiffy" (t2/select-one-fn :name :model/Card c-id)))))))))
