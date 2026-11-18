(ns metabase.analyze.classifiers.name
  "Classifier that infers the semantic type of a Field based on its name and base type."
  (:refer-clojure :exclude [some])
  (:require
   [clojure.string :as str]
   [metabase.analyze.schema :as analyze.schema]
   [metabase.config.core :as config]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.performance :refer [some]]))

(def ^:private float-type       #{:type/Float})
(def ^:private int-type         #{:type/Integer})
(def ^:private int-or-text-type #{:type/Integer :type/Text})
(def ^:private text-type        #{:type/Text})
(def ^:private timestamp-type   #{:type/DateTime})
(def ^:private time-type        #{:type/Time})
(def ^:private date-type        #{:type/Date})
(def ^:private temporal-type    #{:type/Temporal})
(def ^:private number-type      #{:type/Number})
(def ^:private boolean-type     #{:type/Boolean})
(def ^:private any-type         #{:type/*})

(def ^:private pattern+base-types+semantic-type
  "Tuples of `[name-pattern set-of-valid-base-types semantic-type]`.
   Fields whose name matches the pattern and one of the base types should be given the semantic type.
   Be mindful that patterns are tried top to bottom when matching derived types (eg. Date should be
   before DateTime).

   *  Convert field name to lowercase before matching against a pattern
   *  Consider a nil set-of-valid-base-types to mean \"match any base type\""
  ;; Names an older rule already types keep that exact type, because some consumers compare `semantic_type` with `=`
  ;; rather than `isa?`. The exceptions are the rules marked as tightened below. Rules for the semantic-layer types
  ;; therefore sit at the end, where they only type names nothing above matches.
  ;;
  ;; Types that need more than a column's own name are not inferred here: key roles that derive from `:type/PK` or
  ;; `:type/FK` (they need a declared key or its target), pair rules (`:type/TypeDiscriminator`, `:type/HierarchyLevel`,
  ;; `:type/HierarchyPath`), table-context rules (`:type/EventTimestamp`, `:type/PeriodKey`, `:type/DurableKey`,
  ;; `:type/Weight`, `:type/DegenerateDimension`), and the facet `:type/CustomProperty`.
  [[#"^id$"                        any-type         :type/PK]
   ;; loader bookkeeping, before `start` reads `_fivetran_start` as an interval start
   [#"^_fivetran_deleted$"         boolean-type     :type/SoftDeleteFlag]
   [#"^_fivetran_active$"          boolean-type     :type/CurrentRowFlag]
   [#"^(?:_fivetran_synced|_airbyte_(?:extracted|emitted)_at)$" temporal-type :type/LoadTimestamp]
   [#"^(?:_fivetran_start|dbt_valid_from)$" temporal-type :type/ValidFrom]
   [#"^(?:_fivetran_end|dbt_valid_to)$"     temporal-type :type/ValidTo]
   [#"^lon$"                       float-type       :type/Longitude]
   [#"^.*_lon$"                    float-type       :type/Longitude]
   [#"^.*_lng$"                    float-type       :type/Longitude]
   [#"^.*_long$"                   float-type       :type/Longitude]
   [#"^.*_longitude$"              float-type       :type/Longitude]
   [#"^lng$"                       float-type       :type/Longitude]
   [#"^long$"                      float-type       :type/Longitude]
   [#"^longitude$"                 float-type       :type/Longitude]
   [#"^lat$"                       float-type       :type/Latitude]
   [#"^.*_lat$"                    float-type       :type/Latitude]
   [#"^latitude$"                  float-type       :type/Latitude]
   [#"^.*_latitude$"               float-type       :type/Latitude]
   [#"^.*_type$"                   text-type        :type/Category]
   [#"^.*_url$"                    text-type        :type/URL]
   [#"^city$"                      text-type        :type/City]
   [#"^country"                    text-type        :type/Country]
   [#"_country$"                   text-type        :type/Country]
   [#"^currency$"                  text-type        :type/Category]
   [#"^first(?:_?)name$"           text-type        :type/Name]
   [#"^full(?:_?)name$"            text-type        :type/Name]
   [#"^gender$"                    text-type        :type/Category]
   [#"^last(?:_?)name$"            text-type        :type/Name]
   [#"^name$"                      text-type        :type/Name]
   [#"^postal(?:_?)code$"          int-or-text-type :type/ZipCode]
   [#"^role$"                      text-type        :type/Category]
   [#"^sex$"                       text-type        :type/Category]
   [#"^status$"                    text-type        :type/Category]
   [#"^type$"                      text-type        :type/Category]
   [#"^url$"                       text-type        :type/URL]
   [#"^zip(?:_?)code$"             int-or-text-type :type/ZipCode]
   ;; tightened: an ID from another system, not the acquisition source
   [#"^(?:external|source|legacy|remote)_id$|_external_id$" int-or-text-type :type/ExternalID]
   [#"discount"                    number-type      :type/Discount]
   [#"income"                      number-type      :type/Income]
   [#"quantity"                    int-type         :type/Quantity]
   [#"count$"                      int-type         :type/Quantity]
   ;; tightened: `number` alone or as a suffix is an identifier (invoice_number), not an amount (number_of_items)
   [#"(?:^|_)number$"              int-type         :type/NaturalKey]
   [#"number"                      int-type         :type/Quantity]
   [#"^num_"                       int-type         :type/Quantity]
   [#"join"                        date-type        :type/JoinDate]
   [#"join"                        time-type        :type/JoinTime]
   [#"join"                        timestamp-type   :type/JoinTimestamp]
   [#"create"                      date-type        :type/CreationDate]
   [#"create"                      time-type        :type/CreationTime]
   [#"create"                      timestamp-type   :type/CreationTimestamp]
   [#"(?:^|_)(?:valid|effective)_(?:from|start)|^effective_date$" temporal-type :type/ValidFrom]
   [#"(?:^|_)(?:valid|effective)_(?:to|until|end)" temporal-type :type/ValidTo]
   ;; tightened: an interval start, not the row's creation
   [#"(?:^|_)start"                temporal-type    :type/StartTimestamp]
   [#"cancel"                      date-type        :type/CancelationDate]
   [#"cancel"                      time-type        :type/CancelationTime]
   [#"cancel"                      timestamp-type   :type/CancelationTimestamp]
   [#"delet(?:e|i)"                date-type        :type/DeletionDate]
   [#"delet(?:e|i)"                time-type        :type/DeletionTime]
   [#"delet(?:e|i)"                timestamp-type   :type/DeletionTimestamp]
   [#"update"                      date-type        :type/UpdatedDate]
   [#"update"                      time-type        :type/UpdatedTime]
   [#"update"                      timestamp-type   :type/UpdatedTimestamp]
   [#"source"                      int-or-text-type :type/Source]
   [#"channel"                     int-or-text-type :type/Source]
   ;; tightened: not shared
   [#"share(?!d)"                  float-type       :type/Share]
   [#"percent"                     float-type       :type/Share]
   ;; tightened: exchange_rate is a rate, not a share of a whole
   [#"rate$"                       float-type       :type/Rate]
   [#"margin"                      number-type      :type/GrossMargin]
   [#"cost"                        number-type      :type/Cost]
   [#"duration"                    number-type      :type/Duration]
   [#"author"                      int-or-text-type :type/Author]
   [#"creator"                     int-or-text-type :type/Author]
   [#"created(?:_?)by"             int-or-text-type :type/Author]
   [#"owner"                       int-or-text-type :type/Owner]
   [#"company"                     int-or-text-type :type/Company]
   [#"vendor"                      int-or-text-type :type/Company]
   [#"subscription"                int-or-text-type :type/Subscription]
   [#"score"                       number-type      :type/Score]
   ;; tightened: not operating_system
   [#"(?<!ope)rating"              number-type      :type/Score]
   [#"stars"                       number-type      :type/Score]
   [#"description"                 text-type        :type/Description]
   [#"title"                       text-type        :type/Title]
   [#"comment"                     text-type        :type/Comment]
   [#"birthda(?:te|y)"             date-type        :type/Birthdate]
   [#"birthda(?:te|y)"             timestamp-type   :type/Birthdate]
   [#"(?:te|y)(?:_?)of(?:_?)birth" date-type        :type/Birthdate]
   [#"(?:te|y)(?:_?)of(?:_?)birth" timestamp-type   :type/Birthdate]
   ;; semantic-layer types
   [#"^(?:_fivetran_|_airbyte_|dbt_)" any-type      :type/SystemColumn]
   [#"^(?:_?loaded_at|synced_at|_etl_loaded_at|ingested_at)$" temporal-type :type/LoadTimestamp]
   [#"(?:^|_)(?:end|ends|ended|due|expires|expiry|expiration|completed)(?:_|$)" temporal-type :type/EndTimestamp]
   [#"^last_(?!modified)"          temporal-type    :type/LastActivityTimestamp]
   ;; a past-tense verb with `_at` is one step of a process (shipped_at), unless it is load or edit bookkeeping
   [#"^(?!(?:modified|inserted|extracted|ingested|processed|refreshed)_)(?:[a-z]+ed|paid|sent|won|lost)_(?:at|on|date|time)$"
    temporal-type    :type/MilestoneTimestamp]
   [#"(?:^|_)(?:time_?zone|tz|utc_offset)$" int-or-text-type :type/TimeZone]
   [#"(?:^|_)(?:user_agent|browser|os|operating_system)$" text-type :type/UserAgent]
   [#"(?:^|_)(?:file_?name|file_?path)$" text-type  :type/FilePath]
   [#"^(?:row_hash|record_hash|_hash|hashdiff)$" text-type :type/RowHash]
   [#"(?:^|_)(?:hash|checksum|digest|md5|sha\d*)$" text-type :type/Hash]
   [#"^(?:version|revision|etag|rev)$|_version$" int-or-text-type :type/Version]
   [#"(?:^|_)(?:unit_price|unit_amount|unit_cost|rate_amount|price_per_unit)$" number-type :type/UnitPrice]
   [#"^(?:impressions|clicks|views|opens|visits|installs|conversions|sessions|downloads|signups|likes|followers)$"
    int-type         :type/Count]
   [#"(?:^|_)(?:bytes|file_size|size_bytes)$|_(?:kb|mb|gb)$" int-type :type/Bytes]
   [#"(?:^|_)(?:balance|mrr|arr|remaining|on_hand|cumulative|outstanding)(?:_|$)" number-type :type/Balance]
   [#"^(?:min|max|minimum|maximum)_|_(?:min|max|low|high|floor|ceiling)$" number-type :type/RangeBound]
   [#"(?:^|_)(?:ctr|cpc|cpm|cpa|roas)$" float-type  :type/Rate]
   ;; not `state`, which is as often an address as a lifecycle state
   [#"_status$|(?:^|_)(?:stage|phase|result)$" int-or-text-type :type/Status]
   [#"(?:^|_)(?:priority|severity|urgency|tier)$" int-or-text-type :type/Priority]
   [#"(?:^|_)reason$|^reason_"     text-type        :type/Reason]
   [#"^kind$|_kind$"               text-type        :type/Kind]
   [#"(?:^|_)(?:medium|utm_medium)$" text-type      :type/Channel]
   [#"(?:^|_)(?:locale|language|lang)(?:_code)?$" text-type :type/Locale]
   [#"(?:^|_)colou?r(?:_hex|_code)?$" text-type     :type/Color]
   [#"(?:^|_)(?:tags|labels|keywords)$" text-type   :type/Tags]
   [#"currency_code$|_currency$"   text-type        :type/CurrencyCode]
   [#"(?:^|_)(?:unit|uom)$"        text-type        :type/UnitOfMeasure]
   [#"(?:^|_)(?:phone|mobile|telephone|fax)(?:_number|_no)?$" text-type :type/Phone]
   [#"(?:^|_)(?:number|no|code|sku|reference|ref)$" int-or-text-type :type/NaturalKey]
   [#"^(?:index|idx|array_index)$" int-type         :type/ArrayIndex]
   [#"(?:^|_)(?:sort_order|display_order|sort_index|position)$" number-type :type/SortOrder]
   [#"^(?:is_)?(?:deleted|archived|removed|trashed)$" boolean-type :type/SoftDeleteFlag]
   [#"^(?:is_current|is_latest|current_flag)$" boolean-type :type/CurrentRowFlag]
   [#"^(?:is_test|livemode|test_mode|is_internal|is_sandbox|is_demo)$" boolean-type :type/TestDataFlag]
   [#"^(?:is_default|is_primary)$" boolean-type     :type/PrimaryFlag]
   [#"^(?:is|has)_"                boolean-type     :type/Flag]])

;; Check that all the pattern tuples are valid
(when-not config/is-prod?
  (doseq [[name-pattern base-types semantic-type] pattern+base-types+semantic-type]
    (assert (instance? java.util.regex.Pattern name-pattern))
    (assert (every? #(isa? % :type/*) base-types))
    (assert (or (isa? semantic-type :Semantic/*)
                (isa? semantic-type :Relation/*)))))

(mu/defn- semantic-type-for-name-and-base-type :- [:maybe ms/FieldSemanticOrRelationType]
  "If `name` and `base-type` matches a known pattern, return the `semantic-type` we should assign to it."
  [field-name :- ms/NonBlankString
   base-type  :- ms/FieldType]
  (let [field-name (u/lower-case-en field-name)]
    (some (fn [[name-pattern valid-base-types semantic-type]]
            (when (and (some (partial isa? base-type) valid-base-types)
                       (re-find name-pattern field-name))
              semantic-type))
          pattern+base-types+semantic-type)))

(def ^:private MinimalFieldOrColumn
  "The subset of a Field/column map this classifier actually reads: name, base type, and (when already
  known) semantic type."
  [:map {:closed true}
   [:name          {:optional true} [:maybe :string]]
   [:base_type     {:optional true} [:maybe ms/FieldType]]
   [:semantic_type {:optional true} [:maybe ms/FieldSemanticOrRelationType]]])

(def ^:private FieldOrColumn
  "Schema that allows a `:model/Field`, a column from a query resultset, or a minimal name/type map (as
  hand-built test fixtures pass)."
  [:or
   ::analyze.schema/Field
   :metabase.legacy-mbql.schema/legacy-column-metadata
   MinimalFieldOrColumn])

(mu/defn infer-semantic-type-by-name :- [:maybe :keyword]
  "Classifier that infers the semantic type of a `field` based on its name and base type."
  [field-or-column :- FieldOrColumn]
  ;; Don't overwrite keys, else we're ok with overwriting as a new more precise type might have
  ;; been added.
  (when-not (or (some (partial isa? (:semantic_type field-or-column)) [:type/PK :type/FK])
                (str/blank? (:name field-or-column)))
    (semantic-type-for-name-and-base-type (:name field-or-column) (:base_type field-or-column))))

(mu/defn infer-and-assoc-semantic-type-by-name :- [:maybe FieldOrColumn]
  "Returns `field-or-column` with a computed semantic type based on the name and base type of the `field-or-column`"
  [field-or-column :- FieldOrColumn
   _fingerprint    :- [:maybe ::lib.schema.metadata.fingerprint/fingerprint]]
  (when-let [inferred-semantic-type (infer-semantic-type-by-name field-or-column)]
    (log/debugf "Based on the name of %s, we're giving it a semantic type of %s."
                (sync-util/name-for-logging field-or-column)
                inferred-semantic-type)
    (assoc field-or-column :semantic_type inferred-semantic-type)))

(defn- prefix-or-postfix
  [s]
  (re-pattern (format "(?:^%s)|(?:%ss?$)" s s)))

(def ^:private entity-types-patterns
  [[(prefix-or-postfix "order")        :entity/TransactionTable]
   [(prefix-or-postfix "transaction")  :entity/TransactionTable]
   [(prefix-or-postfix "sale")         :entity/TransactionTable]
   [(prefix-or-postfix "product")      :entity/ProductTable]
   [(prefix-or-postfix "user")         :entity/UserTable]
   [(prefix-or-postfix "account")      :entity/UserTable]
   [(prefix-or-postfix "people")       :entity/UserTable]
   [(prefix-or-postfix "person")       :entity/UserTable]
   [(prefix-or-postfix "employee")     :entity/UserTable]
   [(prefix-or-postfix "event")        :entity/EventTable]
   [(prefix-or-postfix "checkin")      :entity/EventTable]
   [(prefix-or-postfix "log")          :entity/EventTable]
   [(prefix-or-postfix "subscription") :entity/SubscriptionTable]
   [(prefix-or-postfix "company")      :entity/CompanyTable]
   [(prefix-or-postfix "companies")    :entity/CompanyTable]
   [(prefix-or-postfix "vendor")       :entity/CompanyTable]
   ;; The subjects below match only names no pattern above claims. `account` and `employee` keep
   ;; `:entity/UserTable` rather than becoming `:entity/OrganizationTable` and `:entity/EmployeeTable`, because
   ;; data-sensitivity gating and the x-ray templates key on `:entity/UserTable`; likewise `order_lines` stays a
   ;; transaction table.
   [#"(?:^|_)ads?(?:_|$)"                    :entity/CampaignTable]
   [(prefix-or-postfix "campaign")           :entity/CampaignTable]
   [(prefix-or-postfix "contact")            :entity/ContactTable]
   [(prefix-or-postfix "lead")               :entity/ContactTable]
   [(prefix-or-postfix "customer")           :entity/CustomerTable]
   [(prefix-or-postfix "worker")             :entity/EmployeeTable]
   [(prefix-or-postfix "staff")              :entity/EmployeeTable]
   [(prefix-or-postfix "organization")       :entity/OrganizationTable]
   [(prefix-or-postfix "organisation")       :entity/OrganizationTable]
   [(prefix-or-postfix "workspace")          :entity/OrganizationTable]
   [(prefix-or-postfix "team")               :entity/OrganizationTable]
   [#"^line_?items?|line_?items?$|_lines?$"  :entity/LineItemTable]
   [(prefix-or-postfix "deal")               :entity/OpportunityTable]
   [(prefix-or-postfix "opportunity")        :entity/OpportunityTable]
   [(prefix-or-postfix "opportunities")      :entity/OpportunityTable]
   [(prefix-or-postfix "pipeline")           :entity/OpportunityTable]
   [(prefix-or-postfix "ticket")             :entity/TicketTable]
   [(prefix-or-postfix "case")               :entity/TicketTable]
   [(prefix-or-postfix "incident")           :entity/TicketTable]
   [(prefix-or-postfix "issue")              :entity/TicketTable]
   [(prefix-or-postfix "message")            :entity/MessageTable]
   [(prefix-or-postfix "email")              :entity/MessageTable]
   [(prefix-or-postfix "sms")                :entity/MessageTable]
   [(prefix-or-postfix "call")               :entity/MessageTable]
   [(prefix-or-postfix "chat")               :entity/MessageTable]
   [(prefix-or-postfix "notification")       :entity/MessageTable]
   [(prefix-or-postfix "session")            :entity/SessionTable]
   [(prefix-or-postfix "project")            :entity/ProjectTable]
   [(prefix-or-postfix "job")                :entity/ProjectTable]
   [(prefix-or-postfix "location")           :entity/LocationTable]
   [(prefix-or-postfix "site")               :entity/LocationTable]
   [(prefix-or-postfix "store")              :entity/LocationTable]
   [(prefix-or-postfix "address")            :entity/LocationTable]
   [(prefix-or-postfix "addresses")          :entity/LocationTable]
   [(prefix-or-postfix "device")             :entity/DeviceTable]
   [(prefix-or-postfix "asset")              :entity/DeviceTable]
   [(prefix-or-postfix "calendar")           :entity/CalendarTable]
   [#"^(?:dim_)?dates?(?:_dim(?:ension)?)?$" :entity/CalendarTable]])

(mu/defn infer-entity-type-by-name :- analyze.schema/Table
  "Classifier that infers the semantic type of a `table` based on its name."
  [table :- analyze.schema/Table]
  (let [table-name (-> table :name u/lower-case-en)]
    (assoc table :entity_type (or (some (fn [[pattern type]]
                                          (when (re-find pattern table-name)
                                            type))
                                        entity-types-patterns)
                                  :entity/GenericTable))))
