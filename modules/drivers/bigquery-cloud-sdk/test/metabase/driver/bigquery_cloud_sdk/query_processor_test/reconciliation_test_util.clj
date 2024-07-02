(ns metabase.driver.bigquery-cloud-sdk.query-processor-test.reconciliation-test-util
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver.bigquery-cloud-sdk.query-processor :as bigquery.qp]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.test :as mt]
   [metabase.util.honey-sql-2 :as h2x]))

(def mock-temporal-fields-metadata-provider
  (let [date-field         (merge (meta/field-metadata :checkins :date)
                                  {:id             1
                                   :name           "date"
                                   :base-type      :type/Date
                                   :effective-type :type/Date
                                   :database-type  "date"})
        datetime-field     (merge (meta/field-metadata :checkins :date)
                                  {:id             2
                                   :name           "datetime"
                                   :base-type      :type/DateTime
                                   :effective-type :type/DateTime
                                   :database-type  "datetime"})
        timestamp-field    (merge (meta/field-metadata :checkins :date)
                                  {:id             3
                                   :name           "timestamp"
                                   :base-type      :type/DateTimeWithLocalTZ
                                   :effective-type :type/DateTimeWithLocalTZ
                                   :database-type  "timestamp"})
        unix-seconds-field (merge (meta/field-metadata :checkins :date)
                                  {:id                4
                                   :name              "unix_seconds"
                                   :base-type         :type/Number
                                   :effective-type    :type/DateTime
                                   :coercion-strategy :Coercion/UNIXSeconds->DateTime
                                   :database-type     "integer"})
        unix-millis-field  (merge (meta/field-metadata :checkins :date)
                                  {:id                5
                                   :name              "unix_milliseconds"
                                   :base-type         :type/Number
                                   :effective-type    :type/DateTime
                                   :coercion-strategy :Coercion/UNIXMilliSeconds->DateTime
                                   :database-type     "integer"})]
    (lib.tu/mock-metadata-provider
     meta/metadata-provider
     {:fields [date-field
               datetime-field
               timestamp-field
               unix-seconds-field
               unix-millis-field]})))

(def mock-temporal-fields
  {:date      (lib.metadata/field mock-temporal-fields-metadata-provider 1)
   :datetime  (lib.metadata/field mock-temporal-fields-metadata-provider 2)
   :timestamp (lib.metadata/field mock-temporal-fields-metadata-provider 3)})

(def ^:private reconcilation-test-data
  {:values
   {:local-date                  {:value (t/local-date "2019-12-10")
                                  :type  :date
                                  :as    {:datetime  (t/local-date-time "2019-12-10T00:00:00")
                                          :timestamp (t/zoned-date-time "2019-12-10T00:00:00Z[UTC]")}}
    :local-date-time             {:value (t/local-date-time "2019-12-10T14:47:00")
                                  :type  :datetime
                                  :as    {:date      (t/local-date "2019-12-10")
                                          :timestamp (t/zoned-date-time "2019-12-10T14:47:00Z[UTC]")}}
    :zoned-date-time             {:value (t/zoned-date-time "2019-12-10T14:47:00Z[UTC]")
                                  :type  :timestamp
                                  :as    {:date     (t/local-date "2019-12-10")
                                          :datetime (t/local-date-time "2019-12-10T14:47:00")}}
    :offset-date-time            {:value (t/offset-date-time "2019-12-10T14:47:00Z")
                                  :type  :timestamp
                                  :as    {:date     (t/local-date "2019-12-10")
                                          :datetime (t/local-date-time "2019-12-10T14:47:00")}}
    :unix-timestamp-seconds      {:value [:field 4 nil]
                                  :type  :timestamp
                                  :as    (let [expected (-> [:timestamp_seconds (h2x/identifier :field "PUBLIC" "CHECKINS" "unix_seconds")]
                                                            (h2x/with-database-type-info "timestamp"))]
                                           {:date      [:date expected]
                                            :datetime  [:datetime expected]
                                            :timestamp expected})}
    :unix-timestamp-milliseconds {:value [:field 5 nil]
                                  :type  :timestamp
                                  :as    (let [expected (-> [:timestamp_millis (h2x/identifier :field "PUBLIC" "CHECKINS" "unix_milliseconds")]
                                                            (h2x/with-database-type-info "timestamp"))]
                                           {:date      [:date expected]
                                            :datetime  [:datetime expected]
                                            :timestamp expected})}}

   :filter-value-transforms
   {:identity          identity
    :absolute-datetime (fn [filter-value]
                         (when (instance? java.time.temporal.Temporal filter-value)
                           [:absolute-datetime filter-value :default]))}

   :fields mock-temporal-fields

   :field-ref-fns
   {:basic                               (fn [field]
                                           [:field (:id field) {::add/source-table "ABC"}])
    :default-temporal-unit               (fn [field]
                                           [:field (:id field) {:temporal-unit     :default
                                                                ::add/source-table "ABC"}])
    :base-type                           (fn [field]
                                           [:field (:name field) {:base-type         (:base-type field)
                                                                  ::add/source-table "ABC"}])
    :base-type-and-default-temporal-unit (fn [field]
                                           [:field (:name field) {:base-type         (:base-type field)
                                                                  :temporal-unit     :default
                                                                  ::add/source-table "ABC"}])}

   :filter-types
   {:=       {:honeysql-filter-fn :=
              :num-args           2}
    :>       {:honeysql-filter-fn :>
              :num-args           2}
    :>=      {:honeysql-filter-fn :>=
              :num-args           2}
    :<       {:honeysql-filter-fn :<
              :num-args           2}
    :<=      {:honeysql-filter-fn :<=
              :num-args           2}
    :between {:honeysql-filter-fn :between
              :num-args           3}
    :!=      {:honeysql-filter-fn (fn honeysql-filter-fn [identifier args]
                                    [:or (into [:not= identifier] args)
                                     [:= identifier nil]])
              :num-args           2}}})

(defn test-cases []
  (for [filter-type                 (keys (:filter-types reconcilation-test-data))
        temporal-type               (keys (:fields reconcilation-test-data))
        field-ref-type              (keys (:field-ref-fns reconcilation-test-data))
        value-type                  (keys (:values reconcilation-test-data))
        filter-value-transform-type (keys (:filter-value-transforms reconcilation-test-data))]
    {:filter-type                 filter-type
     :temporal-type               temporal-type
     :field-ref-type              field-ref-type
     :value-type                  value-type
     :filter-value-transform-type filter-value-transform-type}))

(defn- expand-test-case
  [{:keys [temporal-type field-ref-type filter-type value-type filter-value-transform-type], :as test-case}]
  (when-let [filter-value (let [filter-value           (get-in reconcilation-test-data [:values value-type :value])
                                filter-value-transform (get-in reconcilation-test-data [:filter-value-transforms filter-value-transform-type])]
                            (filter-value-transform filter-value))]
    (merge
     test-case
     {:field              (let [field-metadata (get-in reconcilation-test-data [:fields temporal-type])
                                field-ref-fn   (get-in reconcilation-test-data [:field-ref-fns field-ref-type])]
                            (field-ref-fn field-metadata))
      :num-args           (get-in reconcilation-test-data [:filter-types filter-type :num-args])
      :honeysql-filter-fn (get-in reconcilation-test-data [:filter-types filter-type :honeysql-filter-fn])
      :value              (get-in reconcilation-test-data [:values value-type])
      :filter-value       filter-value
      :expected-value     (let [value-info (get-in reconcilation-test-data [:values value-type])]
                            (or (get-in value-info [:as temporal-type])
                                (when (= (:type value-info) temporal-type)
                                  (:value value-info))
                                filter-value))})))

(defn- temporal-type-reconciliation-expected-value
  [{:keys [field temporal-type expected-value honeysql-filter-fn num-args], :as _test-case}]
  (let [field-literal?      (lib.util.match/match-one field [:field (_ :guard string?) _])
        expected-identifier (cond-> (-> (h2x/identifier :field "ABC" (name temporal-type))
                                        (vary-meta assoc ::bigquery.qp/do-not-qualify? true))
                              (not field-literal?) (h2x/with-database-type-info (name temporal-type)))
        args                (repeat (dec num-args) expected-value)]
    (if (fn? honeysql-filter-fn)
      (honeysql-filter-fn expected-identifier args)
      (into [honeysql-filter-fn expected-identifier] args))))

(defn- temporal-type-reconciliation-actual-value
  [{:keys [field num-args filter-value filter-type], :as _test-case}]
  (let [filter-clause (into [filter-type field]
                            (repeat (dec num-args) filter-value))]
    (sql.qp/->honeysql :bigquery-cloud-sdk filter-clause)))

(defn test-temporal-type-reconciliation!
  [test-case]
  (mt/test-driver :bigquery-cloud-sdk
    (qp.store/with-metadata-provider mock-temporal-fields-metadata-provider
      (mt/with-report-timezone-id! nil
        (binding [*print-meta* true]
          (when-let [test-case (expand-test-case test-case)]
            (is (= (temporal-type-reconciliation-expected-value test-case)
                   (temporal-type-reconciliation-actual-value test-case)))))))))
