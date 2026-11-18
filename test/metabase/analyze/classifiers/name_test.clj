(ns metabase.analyze.classifiers.name-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.name :as classifiers.name]
   [metabase.models.interface :as mi]
   [metabase.types.core :as types]))

(deftest ^:parallel semantic-type-for-name-and-base-type-test
  (doseq [[input expected] {["id"      :type/Integer] :type/PK
                            ;; other pattern matches based on type/regex (remember, base_type matters in matching!)
                            ["rating"        :type/Integer] :type/Score
                            ["rating"        :type/Boolean] nil
                            ["country"       :type/Text]    :type/Country
                            ["country"       :type/Integer] nil
                            ["lat"           :type/Float]   :type/Latitude
                            ["latitude"      :type/Float]   :type/Latitude
                            ["foo_latitude"  :type/Float]   :type/Latitude
                            ["foo_lat"       :type/Float]   :type/Latitude}]
    (testing (pr-str (cons 'semantic-type-for-name-and-base-type input))
      (is (= expected
             (apply #'classifiers.name/semantic-type-for-name-and-base-type input))))))

(deftest ^:parallel infer-entity-type-test
  (testing "name matches"
    (let [classify (fn [table-name] (-> (mi/instance :model/Table {:name table-name})
                                        classifiers.name/infer-entity-type-by-name
                                        :entity_type))]
      (testing "matches simple"
        (is (= :entity/TransactionTable
               (classify "MY_ORDERS"))))
      (testing "matches prefix"
        (is (= :entity/ProductTable
               (classify "productcatalogue"))))
      (testing "doesn't match in the middle"
        (is (= :entity/GenericTable
               (classify "myproductcatalogue"))))
      (testing "defaults to generic table"
        (is (= :entity/GenericTable
               (classify "foo")))))))

(deftest ^:parallel infer-entity-type-test-2
  (testing "When using field info"
    (testing "doesn't infer on PK/FK semantic_types"
      (is (nil? (-> {:semantic_type :type/FK
                     :name          "City"
                     :base_type     :type/Text}
                    (classifiers.name/infer-and-assoc-semantic-type-by-name nil)
                    :semantic_type))))))

(deftest ^:parallel infer-entity-type-test-3
  (testing "When using field info"
    (testing "infers on non-PK/FK fields"
      (is (= :type/City
             (-> {:semantic_type :type/Category
                  :name          "City"
                  :base_type     :type/Text}
                 (classifiers.name/infer-and-assoc-semantic-type-by-name nil)
                 :semantic_type))))))

(deftest ^:parallel infer-semantic-type-test
  (let [infer (fn infer [column-name & [base-type]]
                (classifiers.name/infer-semantic-type-by-name
                 {:name column-name, :base_type (or base-type :type/Text)}))]
    (testing "standard checks"
      ;; not exhausting but a place for edge cases in the future
      (are [expected info] (= expected (apply infer info))
        :type/Name     ["first_name"]
        :type/Name     ["name"]
        :type/Quantity ["quantity" :type/Integer]))
    (testing "name and type matches"
      (testing "matches \"updated at\" style columns"
        (let [classify (fn [table-name table-type] (-> (mi/instance :model/Table {:name table-name :base_type table-type})
                                                       classifiers.name/infer-semantic-type-by-name))]
          (doseq [[col-type expected] [[:type/Date :type/UpdatedDate]
                                       [:type/DateTime :type/UpdatedTimestamp]
                                       [:type/Time :type/UpdatedTime]]]
            (doseq [column-name ["updated_at" "updated" "updated-at"]]
              (is (= expected (classify column-name col-type))))))))
    (testing "Doesn't mark state columns (#2735)"
      (doseq [column-name ["state" "order_state" "state_of_order"]]
        (is (not= :type/State (infer column-name)))))))

(defn- infer-by-name [column-name base-type]
  (classifiers.name/infer-semantic-type-by-name {:name column-name, :base_type base-type}))

(deftest ^:parallel semantic-layer-keys-test
  (are [column-name base-type expected] (= expected (infer-by-name column-name base-type))
    "invoice_number" :type/Text    :type/NaturalKey
    "order_no"       :type/Integer :type/NaturalKey
    "sku"            :type/Text    :type/NaturalKey
    "external_id"    :type/Text    :type/ExternalID
    "legacy_id"      :type/Integer :type/ExternalID
    "version"        :type/Integer :type/Version
    "etag"           :type/Text    :type/Version))

(deftest ^:parallel semantic-layer-time-roles-test
  (are [column-name base-type expected] (= expected (infer-by-name column-name base-type))
    "start_date"       :type/Date     :type/StartTimestamp
    "started_at"       :type/DateTime :type/StartTimestamp
    "due_date"         :type/Date     :type/EndTimestamp
    "trial_ends_at"    :type/DateTime :type/EndTimestamp
    "completed_at"     :type/DateTime :type/EndTimestamp
    "valid_from"       :type/DateTime :type/ValidFrom
    "effective_to"     :type/Date     :type/ValidTo
    "_fivetran_start"  :type/DateTime :type/ValidFrom
    "_fivetran_end"    :type/DateTime :type/ValidTo
    "_fivetran_synced" :type/DateTime :type/LoadTimestamp
    "loaded_at"        :type/DateTime :type/LoadTimestamp
    "last_login"       :type/DateTime :type/LastActivityTimestamp
    "shipped_at"       :type/DateTime :type/MilestoneTimestamp
    "paid_on"          :type/Date     :type/MilestoneTimestamp
    "timezone"         :type/Text     :type/TimeZone
    "utc_offset"       :type/Integer  :type/TimeZone)
  (testing "bookkeeping dates are not milestones"
    (are [column-name] (not (isa? (infer-by-name column-name :type/DateTime) :type/MilestoneTimestamp))
      "modified_at"
      "inserted_at"
      "processed_at"))
  (testing "names that need table context are left alone"
    (are [column-name] (nil? (infer-by-name column-name :type/DateTime))
      "date"
      "timestamp"
      "day")))

(deftest ^:parallel semantic-layer-measures-test
  (are [column-name base-type expected] (= expected (infer-by-name column-name base-type))
    "account_balance" :type/Float   :type/Balance
    "mrr"             :type/Decimal :type/Balance
    "exchange_rate"   :type/Float   :type/Rate
    "ctr"             :type/Float   :type/Rate
    "unit_price"      :type/Decimal :type/UnitPrice
    "clicks"          :type/Integer :type/Count
    "max_temperature" :type/Float   :type/RangeBound
    "price_high"      :type/Float   :type/RangeBound
    "file_size"       :type/Integer :type/Bytes
    "currency_code"   :type/Text    :type/CurrencyCode
    "order_currency"  :type/Text    :type/CurrencyCode
    "uom"             :type/Text    :type/UnitOfMeasure)
  (testing "measures need a numeric base type"
    (are [column-name] (nil? (infer-by-name column-name :type/Text))
      "account_balance"
      "unit_price"
      "max_temperature")))

(deftest ^:parallel semantic-layer-categories-test
  (are [column-name base-type expected] (= expected (infer-by-name column-name base-type))
    "order_status"        :type/Text    :type/Status
    "stage"               :type/Text    :type/Status
    "priority"            :type/Integer :type/Priority
    "severity"            :type/Text    :type/Priority
    "cancellation_reason" :type/Text    :type/Reason
    "kind"                :type/Text    :type/Kind
    "utm_medium"          :type/Text    :type/Channel
    "locale"              :type/Text    :type/Locale
    "language_code"       :type/Text    :type/Locale
    "color"               :type/Text    :type/Color
    "tags"                :type/Text    :type/Tags
    "is_active"           :type/Boolean :type/Flag
    "has_children"        :type/Boolean :type/Flag
    "is_deleted"          :type/Boolean :type/SoftDeleteFlag
    "archived"            :type/Boolean :type/SoftDeleteFlag
    "_fivetran_deleted"   :type/Boolean :type/SoftDeleteFlag
    "is_current"          :type/Boolean :type/CurrentRowFlag
    "_fivetran_active"    :type/Boolean :type/CurrentRowFlag
    "livemode"            :type/Boolean :type/TestDataFlag
    "is_primary"          :type/Boolean :type/PrimaryFlag)
  (testing "flags need a boolean base type"
    (is (nil? (infer-by-name "is_active" :type/Integer))))
  (testing "`state` is as often an address as a lifecycle state"
    (is (nil? (infer-by-name "state" :type/Text)))
    (is (nil? (infer-by-name "billing_state" :type/Text)))))

(deftest ^:parallel semantic-layer-identity-text-test
  (are [column-name base-type expected] (= expected (infer-by-name column-name base-type))
    "phone"         :type/Text :type/Phone
    "phone_number"  :type/Text :type/Phone
    "user_agent"    :type/Text :type/UserAgent
    "browser"       :type/Text :type/UserAgent
    "file_name"     :type/Text :type/FilePath
    "password_hash" :type/Text :type/Hash
    "md5"           :type/Text :type/Hash))

(deftest ^:parallel semantic-layer-structure-test
  (are [column-name base-type expected] (= expected (infer-by-name column-name base-type))
    "_fivetran_id"       :type/Text    :type/SystemColumn
    "_airbyte_raw_id"    :type/Text    :type/SystemColumn
    "dbt_scd_id"         :type/Text    :type/SystemColumn
    "row_hash"           :type/Text    :type/RowHash
    "sort_order"         :type/Integer :type/SortOrder
    "position"           :type/Integer :type/SortOrder
    "index"              :type/Integer :type/ArrayIndex)
  (testing "declared keys are never re-typed by name"
    (is (nil? (classifiers.name/infer-semantic-type-by-name
               {:name "_fivetran_id", :base_type :type/Text, :semantic_type :type/PK})))))

(deftest ^:parallel tightened-patterns-test
  (are [column-name base-type expected] (= expected (infer-by-name column-name base-type))
    ;; `start` is an interval start, not the row's creation
    "start"           :type/Date     :type/StartTimestamp
    "start_time"      :type/Time     :type/StartTimestamp
    "restarts"        :type/DateTime nil
    ;; `number` alone or as a suffix is an identifier; `count` and `number_of` are still amounts
    "number"          :type/Integer  :type/NaturalKey
    "invoice_number"  :type/Integer  :type/NaturalKey
    "number_of_items" :type/Integer  :type/Quantity
    "item_count"      :type/Integer  :type/Quantity
    ;; `source_id` is an external ID; `source` is still the acquisition source
    "source_id"       :type/Integer  :type/ExternalID
    "source"          :type/Text     :type/Source
    ;; `rate` is a rate, which is still a share
    "exchange_rate"   :type/Float    :type/Rate
    "share"           :type/Float    :type/Share
    "shared"          :type/Float    nil
    "rating"          :type/Integer  :type/Score
    "duration"        :type/Integer  :type/Duration
    "created_by"      :type/Text     :type/Author))

(deftest ^:parallel names-typed-before-keep-their-type-test
  (testing "names an older rule types keep that exact type, since some consumers compare semantic types with ="
    (are [column-name base-type expected] (= expected (infer-by-name column-name base-type))
      "status"              :type/Text     :type/Category
      "type"                :type/Text     :type/Category
      "event_type"          :type/Text     :type/Category
      "device_type"         :type/Text     :type/Category
      "currency"            :type/Text     :type/Category
      "channel"             :type/Text     :type/Source
      "subscription_status" :type/Text     :type/Subscription
      "unit_cost"           :type/Float    :type/Cost
      "min_rating"          :type/Integer  :type/Score
      "max_discount"        :type/Float    :type/Discount
      "created_at"          :type/DateTime :type/CreationTimestamp
      "last_updated"        :type/DateTime :type/UpdatedTimestamp
      "dbt_updated_at"      :type/DateTime :type/UpdatedTimestamp
      "canceled_at"         :type/DateTime :type/CancelationTimestamp
      "count"               :type/Integer  :type/Quantity
      "num_items"           :type/Integer  :type/Quantity
      "zip_code"            :type/Text     :type/ZipCode
      "country_code"        :type/Text     :type/Country)))

(deftest ^:parallel every-inferred-semantic-type-is-semantic-or-relation-test
  (doseq [[_pattern base-types semantic-type] @#'classifiers.name/pattern+base-types+semantic-type]
    (testing semantic-type
      (is (or (isa? semantic-type :Semantic/*)
              (isa? semantic-type :Relation/*)))
      (is (every? #(isa? % :type/*) base-types)))))

(deftest ^:parallel infer-new-subjects-test
  (let [classify (fn [table-name]
                   (-> (mi/instance :model/Table {:name table-name})
                       classifiers.name/infer-entity-type-by-name
                       :entity_type))]
    (are [table-name expected] (= expected (classify table-name))
      "contacts"          :entity/ContactTable
      "leads"             :entity/ContactTable
      "customers"         :entity/CustomerTable
      "workers"           :entity/EmployeeTable
      "staff"             :entity/EmployeeTable
      "organizations"     :entity/OrganizationTable
      "workspaces"        :entity/OrganizationTable
      "teams"             :entity/OrganizationTable
      "line_items"        :entity/LineItemTable
      "invoice_lines"     :entity/LineItemTable
      "deals"             :entity/OpportunityTable
      "opportunities"     :entity/OpportunityTable
      "tickets"           :entity/TicketTable
      "cases"             :entity/TicketTable
      "incidents"         :entity/TicketTable
      "jira_issues"       :entity/TicketTable
      "messages"          :entity/MessageTable
      "emails"            :entity/MessageTable
      "sms"               :entity/MessageTable
      "calls"             :entity/MessageTable
      "notifications"     :entity/MessageTable
      "sessions"          :entity/SessionTable
      "campaigns"         :entity/CampaignTable
      "ad_groups"         :entity/CampaignTable
      "facebook_ads"      :entity/CampaignTable
      "projects"          :entity/ProjectTable
      "jobs"              :entity/ProjectTable
      "locations"         :entity/LocationTable
      "stores"            :entity/LocationTable
      "shipping_addresses" :entity/LocationTable
      "devices"           :entity/DeviceTable
      "assets"            :entity/DeviceTable
      "calendar"          :entity/CalendarTable
      "dim_date"          :entity/CalendarTable)
    (testing "names matched before keep their subject"
      (are [table-name expected] (= expected (classify table-name))
        "users"               :entity/UserTable
        "accounts"            :entity/UserTable
        "employees"           :entity/UserTable
        "people"              :entity/UserTable
        "order_lines"         :entity/TransactionTable
        "email_subscriptions" :entity/SubscriptionTable
        "events"              :entity/EventTable
        "address"             :entity/LocationTable
        "my_widgets"          :entity/GenericTable))
    (testing "every inferred subject is in the entity hierarchy"
      (doseq [[_pattern entity-type] @#'classifiers.name/entity-types-patterns]
        (is (isa? types/entity-hierarchy entity-type :entity/GenericTable) (pr-str entity-type))))))
