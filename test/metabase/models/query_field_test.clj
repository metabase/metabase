(ns metabase.models.query-field-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models :refer [Card]]
   [metabase.models.query-field :as query-field]
   [metabase.native-query-analyzer :as query-analyzer]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:private query-field-keys [:card_id :field_id :direct_reference])

(defn- qf->map [query-field]
  (select-keys query-field query-field-keys))

(defn- query-fields-for-card
  [card-id]
  (t2/select-fn-set qf->map :model/QueryField
                    :card_id card-id))

(defn- do-with-test-setup [f]
  (mt/with-temporary-setting-values [sql-parsing-enabled true]
    (binding [query-analyzer/*parse-queries-in-test?* true]
      (let [table-id (mt/id :orders)
            tax-id   (mt/id :orders :tax)
            total-id (mt/id :orders :total)]
        (t2.with-temp/with-temp [:model/Card {card-id :id}
                                 {:dataset_query (mt/native-query {:query "SELECT NOT_TAX, TOTAL FROM orders"})}]
          (try
            (f {:card-id  card-id
                :tax-id   tax-id
                :total-id total-id
                :table-id table-id})
            (finally
              (t2/delete! :model/QueryField :card_id card-id))))))))

(defmacro ^:private with-test-setup
  "Creates a new card that queries one column that exists (TOTAL) and one that does not (NOT_TAX). Anaphorically
  provides `card-id`, `table-id`, `tax-id`, and `total-id`."
  [& body]
  `(do-with-test-setup (fn [{:keys [~'table-id ~'tax-id ~'total-id ~'card-id]}]
                         ~@body)))

(defn- trigger-parse!
  "Update the card to an arbitrary query; defaults to querying the two columns that do exist: TAX and TOTAL"
  ([card-id]
   (trigger-parse! card-id "SELECT TAX, TOTAL FROM orders"))
  ([card-id query]
   (if (string? query)
     (t2/update! :model/Card card-id {:dataset_query (mt/native-query {:query query})})
     (t2/update! :model/Card card-id {:dataset_query query}))))

;;;;
;;;; Actual tests
;;;;

(deftest query-fields-created-by-queries-test
  (with-test-setup
    (let [total-qf {:card_id          card-id
                    :field_id         total-id
                    :direct_reference true}
          tax-qf   {:card_id          card-id
                    :field_id         tax-id
                    :direct_reference true}]

      (testing "A freshly created card has relevant corresponding QueryFields"
        (is (= #{total-qf}
               (query-fields-for-card card-id))))

      (testing "Adding new columns to the query also adds the QueryFields"
        (trigger-parse! card-id)
        (is (= #{tax-qf total-qf}
               (query-fields-for-card card-id))))

      (testing "Removing columns from the query removes the QueryFields"
        (trigger-parse! card-id "SELECT tax, not_total FROM orders")
        (is (= #{tax-qf}
               (query-fields-for-card card-id))))

      (testing "Columns referenced via field filters are still found"
        (trigger-parse! card-id
                        (mt/native-query {:query "SELECT tax FROM orders WHERE {{adequate_total}}"
                                          :template-tags {"adequate_total"
                                                          {:type         :dimension
                                                           :name         "adequate_total"
                                                           :display-name "Total is big enough"
                                                           :dimension    [:field (mt/id :orders :total)
                                                                          {:base-type :type/Number}]
                                                           :widget-type  :number/>=}}}))
        (is (= #{tax-qf total-qf}
               (query-fields-for-card card-id)))))))

(deftest bogus-queries-test
  (with-test-setup
    (testing "Updating a query with bogus columns does not create QueryFields"
      (trigger-parse! card-id "SELECT DOES, NOT_EXIST FROM orders")
      (is (empty? (t2/select :model/QueryField :card_id card-id))))))

(deftest wildcard-test
  (with-test-setup
    (let [total-qf {:card_id          card-id
                    :field_id         total-id
                    :direct_reference false}
          tax-qf   {:card_id          card-id
                    :field_id         tax-id
                    :direct_reference false}]
      (testing "simple select *"
        (trigger-parse! card-id "select * from orders")
        (let [qfs (query-fields-for-card card-id)]
          (is (= 9 (count qfs)))
          (is (not-every? :direct_reference qfs))
          (is (set/subset? #{total-qf tax-qf} qfs)))))))

(deftest table-wildcard-test
  (with-test-setup
    (let [total-qf {:card_id          card-id
                    :field_id         total-id
                    :direct_reference true}
          tax-qf   {:card_id          card-id
                    :field_id         tax-id
                    :direct_reference true}]
      (testing "mix of select table.* and named columns"
        (trigger-parse! card-id "select p.*, o.tax, o.total from orders o join people p on p.id = o.user_id")
        (let [qfs (query-fields-for-card card-id)]
          (is (= (+ 13 #_people 2 #_tax-and-total 1 #_o.user_id)
                 (count qfs)))
          ;; 13 total, but id is referenced directly
          (is (= 12 (t2/count :model/QueryField :card_id card-id :direct_reference false)))
          ;; subset since it also includes the PKs/FKs
          (is (set/subset? #{total-qf tax-qf}
                           (t2/select-fn-set qf->map :model/QueryField :card_id card-id :direct_reference true))))))))

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
        (is (= {:direct #{%venues.name %venues.price}}
               (#'query-field/query-field-ids (:dataset_query c1))))
        (is (= {:direct nil}
               (#'query-field/query-field-ids (:dataset_query c2))))
        (is (= {:direct #{%venues.id %checkins.venue_id}}
               (#'query-field/query-field-ids (:dataset_query c3)))))))
  (testing "Parsing pMBQL query returns correct used fields"
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          venues            (lib.metadata/table metadata-provider (mt/id :venues))
          venues-name       (lib.metadata/field metadata-provider (mt/id :venues :name))
          mlv2-query        (-> (lib/query metadata-provider venues)
                                (lib/aggregate (lib/distinct venues-name)))]
      (is (= {:direct #{(mt/id :venues :name)}}
               (#'query-field/query-field-ids mlv2-query))))))
