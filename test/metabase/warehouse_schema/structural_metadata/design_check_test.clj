(ns metabase.warehouse-schema.structural-metadata.design-check-test
  "Runs the prototype classifiers over fixture schemas and saves what they find through the models, to check that the
  structural metadata columns can hold it.

  Every classifier output either maps to a column or is one of the [[dropped-outputs]]; anything else fails. Each
  fixture also declares the mismatches that lose something about one of its tables (see [[table-mismatches]]), so the
  test fails when a mismatch appears or goes away."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.warehouse-schema.structural-metadata.fixtures :as fixtures]
   [metabase.warehouse-schema.structural-metadata.prototype-classifiers.custom-property :as classifiers.custom-property]
   [metabase.warehouse-schema.structural-metadata.prototype-classifiers.history :as classifiers.history]
   [metabase.warehouse-schema.structural-metadata.prototype-classifiers.table-role :as classifiers.table-role]
   [toucan2.core :as t2]))

(def ^:private dropped-outputs
  "Classifier outputs that no structural metadata column holds, as `[classifier key]`, with why."
  {[:table-role :signal]
   "The one-line reason for an admin has no column."
   [:table-role :confidence]
   "No column says a role is a low-confidence guess that needs review; a name-only guess is stored like a sure one."
   [:history :signal]
   "The reason has no column. For SCD type 6 it is also the only place the current-value columns are named."
   [:history :confidence]
   "No column says the SCD type is a guess."
   [:eav :signal]
   "The reason has no column."
   [:eav :confidence]
   "No column says the binding is incomplete or a guess."
   [:custom-property-facet :prefix]
   "The facet column holds a type keyword per facet key, not the wildcard prefix."
   [:custom-property-facet :suffix]
   "The customer-chosen part of a `custom_*` / `property_*` name has no column, though it can be read off the name."
   [:wildcard-definition-table :name]
   "No Table column points a table with wildcard columns at the table that defines them; `eav_definition` describes
   an EAV table's own rows."})

(def ^:private eav-binding-keys
  "The prototype's EAV binding keys, renamed to the `eav_definition` keys."
  {:entity_key_field     :entity_key
   :property_name_field  :property_name
   :property_value_field :property_value
   :definition_table_id  :definition_table
   :label_field          :label
   :type_field           :type})

(def ^:private history-binding-keys
  {:durable_key  :durable_key
   :valid_from   :valid_from
   :valid_to     :valid_to
   :current_flag :current_flag
   :version      :version})

(def ^:private custom-property-facet
  "The values a wildcard column's custom property facet is saved as."
  {:facets {:structure :type/CustomProperty}})

(defn- classify
  "Every prototype classifier's output for the Table `table`, given the other `schema-tables` in its schema."
  [{table-name :name, :keys [fields]} schema-tables]
  (let [role (classifiers.table-role/infer-table-role table-name fields)]
    {:table-role                role
     :history                   (classifiers.history/infer-history table-name (:role role) fields)
     :eav                       (classifiers.custom-property/infer-custom-property-binding
                                 table-name (:role role) fields schema-tables)
     :wildcard-definition-table (some-> (classifiers.custom-property/infer-wildcard-definition-table
                                         table-name schema-tables)
                                        (select-keys [:name]))
     :custom-property-facets    (into {}
                                      (keep (fn [field]
                                              (when-let [facet (classifiers.custom-property/infer-custom-property-facet
                                                                field)]
                                                [(:id field) facet])))
                                      fields)}))

(defn- rename-binding
  "`bound` with its keys renamed by `key-map`, plus the keys `key-map` does not know."
  [bound key-map]
  {:value   (update-keys (select-keys bound (keys key-map)) key-map)
   :unknown (set (keys (apply dissoc bound (keys key-map))))})

(defn- leftover-keys
  "The `[classifier key]` paths of the keys of `output`, which may be nil, besides `used-keys`."
  [classifier output used-keys]
  (into #{} (map (fn [k] [classifier k])) (keys (apply dissoc output used-keys))))

(defn- translate
  "The column values for the classifier `outputs` of one table: `:table` and `:fields` (field ID to changes) to write,
  and `:leftovers`, the output paths no column took."
  [{:keys [table-role history eav wildcard-definition-table custom-property-facets]}]
  (let [history-binding (some-> history :binding (rename-binding history-binding-keys))
        eav-binding     (some-> eav :binding (rename-binding eav-binding-keys))]
    {:table     (cond-> {}
                  table-role (assoc :table_role (:role table-role))
                  history    (assoc :scd_type (:scd_type history)
                                    :history_definition (:value history-binding))
                  eav        (assoc :eav_definition (:value eav-binding)))
     :fields    (update-vals custom-property-facets (constantly custom-property-facet))
     :leftovers (set/union (leftover-keys :table-role table-role [:role])
                           (leftover-keys :history history [:scd_type :binding])
                           (leftover-keys :eav eav [:binding])
                           (leftover-keys :wildcard-definition-table wildcard-definition-table [])
                           (into #{} (map (fn [k] [:history-binding k])) (:unknown history-binding))
                           (into #{} (map (fn [k] [:eav-binding k])) (:unknown eav-binding))
                           (into #{}
                                 (mapcat #(leftover-keys :custom-property-facet % []))
                                 (vals custom-property-facets)))}))

(defn- table-mismatches
  "The dropped outputs that lose something about this table, given its classifier `outputs`:

  - `:low-confidence-role`, `:low-confidence-history`, `:low-confidence-eav`: a guess is stored like a sure answer.
  - `:scd-6-current-values`: the columns holding each entity's current value are only named in the signal.
  - `[:wildcard-definition-table name]`: the table defining this table's wildcard columns has no column.
  - `[:custom-property-facet field-name]`: the facet's prefix and suffix become `{:structure :type/CustomProperty}`."
  [{:keys [table-role history eav wildcard-definition-table custom-property-facets]} id->name]
  (cond-> (into #{}
                (map (fn [field-id] [:custom-property-facet (id->name field-id)]))
                (keys custom-property-facets))
    (= :low (:confidence table-role)) (conj :low-confidence-role)
    (= :low (:confidence history))    (conj :low-confidence-history)
    (= :low (:confidence eav))        (conj :low-confidence-eav)
    (= 6 (:scd_type history))         (conj :scd-6-current-values)
    wildcard-definition-table         (conj [:wildcard-definition-table (:name wildcard-definition-table)])))

(defn- check-table!
  "Classify the inserted `table`, save the translated values through the models, and check they read back unchanged.
  Returns `:table-name`, `:saved` (the values read back, with history and EAV IDs as names and `:fields` keyed by field
  name) and `:mismatches`."
  [{table-name :name, table-id :id, :as table} schema-tables id->name]
  (let [outputs (classify table schema-tables)
        {table-changes :table, field-changes :fields, :keys [leftovers]} (translate outputs)]
    (testing table-name
      (testing "every classifier output either maps to a column or is a known dropped output"
        (is (empty? (remove dropped-outputs leftovers))))
      (when (seq table-changes)
        (sync-util/update-table-unless-user-set! table-id table-changes))
      (doseq [[field-id changes] field-changes]
        (sync-util/update-field-unless-user-set! field-id changes))
      (let [saved-table  (select-keys (t2/select-one :model/Table :id table-id) (keys table-changes))
            saved-fields (into {}
                               (for [[field-id changes] field-changes]
                                 [field-id (select-keys (t2/select-one :model/Field :id field-id) (keys changes))]))]
        (testing "the saved values read back unchanged"
          (is (= table-changes saved-table))
          (is (= field-changes saved-fields)))
        {:table-name table-name
         :saved      (cond-> (-> saved-table
                                 (m/update-existing :history_definition update-vals id->name)
                                 (m/update-existing :eav_definition update-vals id->name))
                       (seq saved-fields) (assoc :fields (update-keys saved-fields id->name)))
         :mismatches (table-mismatches outputs id->name)}))))

(defn- run-design-check!
  "Insert `fixture` and run [[check-table!]] on each of its tables. Returns `:saved`, table name to its saved values,
  and `:mismatches`, table name to its [[table-mismatches]] when it has any."
  [fixture]
  (mt/with-temp [:model/Database {db-id :id} {}]
    (let [tables        (fixtures/insert-fixture! db-id fixture)
          schema-tables (mapv #(select-keys % [:id :name :fields]) (vals tables))
          id->name      (into {}
                              (concat (for [table (vals tables)] [(:id table) (:name table)])
                                      (for [table (vals tables), field (:fields table)] [(:id field) (:name field)])))
          results       (mapv (fn [{table-name :name}]
                                (check-table! (tables table-name) schema-tables id->name))
                              (:tables fixture))]
      {:saved      (into {} (map (juxt :table-name :saved)) results)
       :mismatches (into {}
                         (keep (fn [{:keys [table-name mismatches]}]
                                 (when (seq mismatches) [table-name mismatches])))
                         results)})))

(deftest fivetran-salesforce-test
  (let [{:keys [saved mismatches]} (run-design-check! (fixtures/load-fixture "fivetran_salesforce"))]
    (testing "saved values"
      (is (= {"user"                      {:table_role :role/EntityDimension}
              "account"                   {:table_role :role/EntityDimension}
              ;; Salesforce names its dates `created_date` and `last_modified_date`, which no column rule reads
              "contact"                   {}
              "opportunity"               {}
              "opportunity_line_item"     {}
              ;; Salesforce's own field history is read as an EAV table
              "opportunity_field_history" {:table_role     :role/CustomPropertyTable
                                           :eav_definition {:entity_key       "opportunity_id"
                                                            :property_name    "field"
                                                            :property_value   "old_value"
                                                            :definition_table nil
                                                            :label            nil
                                                            :type             nil}}
              "account_history"           {:table_role         :role/HistoryDimension
                                           :scd_type           2
                                           :history_definition {:durable_key  "id"
                                                                :valid_from   "_fivetran_start"
                                                                :valid_to     "_fivetran_end"
                                                                :current_flag "_fivetran_active"
                                                                :version      nil}}
              "fivetran_audit"            {:table_role :role/SystemTable}}
             saved)))
    (testing "translation mismatches"
      (is (= {"user"                      #{:low-confidence-role}
              "account"                   #{:low-confidence-role}
              ;; no definition table: `field` holds Salesforce field API names
              "opportunity_field_history" #{:low-confidence-eav}}
             mismatches)))))

(deftest fivetran-hubspot-test
  (let [{:keys [saved mismatches]} (run-design-check! (fixtures/load-fixture "fivetran_hubspot"))]
    (testing "saved values"
      (is (= {"owner"                    {}
              "company"                  {:table_role :role/EntityDimension
                                          :fields     {"property_name"                custom-property-facet
                                                       "property_domain"              custom-property-facet
                                                       "property_industry"            custom-property-facet
                                                       "property_annualrevenue"       custom-property-facet
                                                       "property_hubspot_owner_id"    custom-property-facet
                                                       "property_createdate"          custom-property-facet
                                                       "property_hs_lastmodifieddate" custom-property-facet}}
              "contact"                  {:fields {"property_email"               custom-property-facet
                                                   "property_firstname"           custom-property-facet
                                                   "property_lastname"            custom-property-facet
                                                   "property_lifecyclestage"      custom-property-facet
                                                   "property_associatedcompanyid" custom-property-facet
                                                   "property_createdate"          custom-property-facet
                                                   "property_lastmodifieddate"    custom-property-facet}}
              "deal"                     {:table_role :role/EntityDimension
                                          :fields     {"property_dealname"   custom-property-facet
                                                       "property_amount"     custom-property-facet
                                                       "property_closedate"  custom-property-facet
                                                       "property_createdate" custom-property-facet
                                                       "property_dealtype"   custom-property-facet}}
              "deal_pipeline"            {:table_role :role/EntityDimension}
              ;; `_fivetran_synced` counts as the table's one timestamp
              "deal_pipeline_stage"      {:table_role :role/EventFact}
              ;; history mode's `_fivetran_start` in the key reads as a periodic snapshot's date
              "deal_stage"               {:table_role :role/PeriodicSnapshotFact}
              ;; `_fivetran_synced` keeps the association from being a bridge
              "deal_company"             {:table_role :role/EventFact}
              "deal_contact"             {:table_role :role/Bridge}
              "engagement"               {}
              "property"                 {:table_role :role/ConfigurationTable}
              "property_option"          {:table_role :role/EventFact
                                          :fields     {"property_id" custom-property-facet}}
              ;; one column is both the start of each version and its version
              "contact_property_history" {:table_role         :role/HistoryDimension
                                          :scd_type           2
                                          :history_definition {:durable_key  "contact_id"
                                                               :valid_from   "timestamp"
                                                               :valid_to     nil
                                                               :current_flag nil
                                                               :version      "timestamp"}}}
             saved)))
    (testing "translation mismatches"
      (is (= {"company"                  #{:low-confidence-role
                                           [:custom-property-facet "property_name"]
                                           [:custom-property-facet "property_domain"]
                                           [:custom-property-facet "property_industry"]
                                           [:custom-property-facet "property_annualrevenue"]
                                           [:custom-property-facet "property_createdate"]
                                           [:custom-property-facet "property_hs_lastmodifieddate"]
                                           [:custom-property-facet "property_hubspot_owner_id"]}
              "contact"                  #{[:custom-property-facet "property_email"]
                                           [:custom-property-facet "property_firstname"]
                                           [:custom-property-facet "property_lastname"]
                                           [:custom-property-facet "property_lifecyclestage"]
                                           [:custom-property-facet "property_associatedcompanyid"]
                                           [:custom-property-facet "property_createdate"]
                                           [:custom-property-facet "property_lastmodifieddate"]}
              ;; the shared `property` table defining these columns is not found: only `deal_*` names are looked for
              "deal"                     #{:low-confidence-role
                                           [:custom-property-facet "property_dealname"]
                                           [:custom-property-facet "property_amount"]
                                           [:custom-property-facet "property_dealtype"]
                                           [:custom-property-facet "property_closedate"]
                                           [:custom-property-facet "property_createdate"]}
              "deal_pipeline"            #{:low-confidence-role}
              "deal_pipeline_stage"      #{:low-confidence-role}
              "deal_company"             #{:low-confidence-role}
              "property"                 #{:low-confidence-role}
              ;; `property_id` is a foreign key, not a wildcard column
              "property_option"          #{:low-confidence-role [:custom-property-facet "property_id"]}
              "contact_property_history" #{:low-confidence-history}}
             mismatches)))))

(deftest fivetran-zendesk-test
  (let [{:keys [saved mismatches]} (run-design-check! (fixtures/load-fixture "fivetran_zendesk"))]
    (testing "saved values"
      (is (= {"organization"         {:table_role :role/EntityDimension}
              "user"                 {:table_role :role/EntityDimension}
              "group"                {:table_role :role/EntityDimension}
              "ticket"               {:table_role :role/EntityDimension
                                      :fields     {"custom_order_number"  custom-property-facet
                                                   "custom_product_area"  custom-property-facet
                                                   "custom_refund_amount" custom-property-facet}}
              "ticket_comment"       {}
              "satisfaction_rating"  {}
              "ticket_field"         {:table_role :role/ConfigurationTable}
              "ticket_tag"           {:table_role :role/EventFact}
              ;; the key's date wins over the EAV shape, and the property name becomes the durable key
              "ticket_field_history" {:table_role         :role/HistoryDimension
                                      :scd_type           2
                                      :history_definition {:durable_key  "field_name"
                                                           :valid_from   "updated"
                                                           :valid_to     nil
                                                           :current_flag nil
                                                           :version      "updated"}}}
             saved)))
    (testing "translation mismatches"
      (is (= {"organization"         #{:low-confidence-role}
              "user"                 #{:low-confidence-role}
              "group"                #{:low-confidence-role}
              "ticket"               #{:low-confidence-role
                                       [:wildcard-definition-table "ticket_field"]
                                       [:custom-property-facet "custom_order_number"]
                                       [:custom-property-facet "custom_product_area"]
                                       [:custom-property-facet "custom_refund_amount"]}
              "ticket_field"         #{:low-confidence-role}
              "ticket_tag"           #{:low-confidence-role}
              "ticket_field_history" #{:low-confidence-history}}
             mismatches)))))

(deftest dbt-snapshot-test
  (let [{:keys [saved mismatches]} (run-design-check! (fixtures/load-fixture "dbt_snapshot"))]
    (testing "saved values"
      (is (= {"orders_snapshot"      {:table_role         :role/HistoryDimension
                                      :scd_type           2
                                      ;; `id` is typed as a PK by name, so the durable key falls to `customer_id`
                                      :history_definition {:durable_key  "customer_id"
                                                           :valid_from   "dbt_valid_from"
                                                           :valid_to     "dbt_valid_to"
                                                           :current_flag nil
                                                           :version      nil}}
              "customers_snapshot"   {:table_role         :role/HistoryDimension
                                      :scd_type           2
                                      :history_definition {:durable_key  "customer_id"
                                                           :valid_from   "dbt_valid_from"
                                                           :valid_to     "dbt_valid_to"
                                                           :current_flag nil
                                                           :version      nil}}
              "dim_employee_history" {:table_role         :role/HistoryDimension
                                      :scd_type           6
                                      :history_definition {:durable_key  "employee_id"
                                                           :valid_from   "valid_from"
                                                           :valid_to     "valid_to"
                                                           :current_flag "is_current"
                                                           :version      nil}}
              "dim_customers"        {:table_role :role/EntityDimension}
              ;; the column rules run before the `fct_` name rule
              "fct_orders"           {:table_role :role/EventFact}
              "fct_daily_inventory"  {:table_role :role/PeriodicSnapshotFact}
              "dim_products"         {:table_role :role/EntityDimension}}
             saved)))
    (testing "translation mismatches"
      (is (= {;; `current_title` and `department_current` are named only in the signal
              "dim_employee_history" #{:scd-6-current-values}
              "fct_orders"           #{:low-confidence-role}}
             mismatches)))))

(deftest test-data-test
  (let [{:keys [saved mismatches]} (run-design-check! (fixtures/database-fixture
                                                       (mt/id)
                                                       ["CATEGORIES" "CHECKINS" "ORDERS" "PEOPLE" "PRODUCTS"
                                                        "REVIEWS" "USERS" "VENUES"]))]
    (testing "saved values"
      (is (= {"CATEGORIES" {:table_role :role/LookupDimension}
              "CHECKINS"   {:table_role :role/EventFact}
              ;; one timestamp and a link to a user win over the `orders` name
              "ORDERS"     {:table_role :role/EventFact}
              "PEOPLE"     {:table_role :role/EntityDimension}
              "PRODUCTS"   {:table_role :role/EntityDimension}
              "REVIEWS"    {:table_role :role/EventFact}
              "USERS"      {:table_role :role/EntityDimension}
              "VENUES"     {}}
             saved)))
    (testing "translation mismatches"
      (is (= {"CATEGORIES" #{:low-confidence-role}
              "CHECKINS"   #{:low-confidence-role}
              "ORDERS"     #{:low-confidence-role}
              "PEOPLE"     #{:low-confidence-role}
              "PRODUCTS"   #{:low-confidence-role}
              "REVIEWS"    #{:low-confidence-role}
              "USERS"      #{:low-confidence-role}}
             mismatches)))))

(deftest sample-database-test
  (let [{:keys [saved mismatches]} (run-design-check! (fixtures/load-fixture "sample_database"))]
    (testing "saved values"
      (is (= {"ACCOUNTS"        {:table_role :role/EntityDimension}
              "ANALYTIC_EVENTS" {:table_role :role/EventFact}
              "FEEDBACK"        {:table_role :role/EventFact}
              ;; one timestamp and a link to an account win over the `invoices` name
              "INVOICES"        {:table_role :role/EventFact}
              ;; one timestamp and a link to a person win over the `orders` name
              "ORDERS"          {:table_role :role/EventFact}
              "PEOPLE"          {:table_role :role/EntityDimension}
              "PRODUCTS"        {:table_role :role/EntityDimension}
              "REVIEWS"         {:table_role :role/EventFact}}
             saved)))
    (testing "translation mismatches"
      (is (= {"ACCOUNTS"        #{:low-confidence-role}
              "ANALYTIC_EVENTS" #{:low-confidence-role}
              "FEEDBACK"        #{:low-confidence-role}
              "INVOICES"        #{:low-confidence-role}
              "ORDERS"          #{:low-confidence-role}
              "PEOPLE"          #{:low-confidence-role}
              "PRODUCTS"        #{:low-confidence-role}
              "REVIEWS"         #{:low-confidence-role}}
             mismatches)))))
