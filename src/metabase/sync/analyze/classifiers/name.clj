(ns metabase.sync.analyze.classifiers.name
  "Classifier that infers the semantic type of a Field based on its name and base type."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.models.database :refer [Database]]
            [metabase.sync.interface :as i]
            [metabase.sync.util :as sync-util]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(def ^:private bool-or-int-type #{:type/Boolean :type/Integer})
(def ^:private float-type       #{:type/Float})
(def ^:private int-type         #{:type/Integer})
(def ^:private int-or-text-type #{:type/Integer :type/Text})
(def ^:private text-type        #{:type/Text})
(def ^:private timestamp-type   #{:type/DateTime})
(def ^:private time-type        #{:type/Time})
(def ^:private date-type        #{:type/Date})
(def ^:private number-type      #{:type/Number})
(def ^:private any-type         #{:type/*})


(def ^:private pattern+base-types+semantic-type
  "Tuples of `[name-pattern set-of-valid-base-types semantic-type]`.
   Fields whose name matches the pattern and one of the base types should be given the semantic type.
   Be mindful that patterns are tried top to bottom when matching derived types (eg. Date should be
   before DateTime).

   *  Convert field name to lowercase before matching against a pattern
   *  Consider a nil set-of-valid-base-types to mean \"match any base type\""
  [[#"^id$"                        any-type         :Relation/PK]
   [#"^.*_lat$"                    float-type       :Semantic/Latitude]
   [#"^.*_lon$"                    float-type       :Semantic/Longitude]
   [#"^.*_lng$"                    float-type       :Semantic/Longitude]
   [#"^.*_long$"                   float-type       :Semantic/Longitude]
   [#"^.*_longitude$"              float-type       :Semantic/Longitude]
   [#"^.*_type$"                   int-or-text-type :Semantic/Category]
   [#"^.*_url$"                    text-type        :Semantic/URL]
   [#"^_latitude$"                 float-type       :Semantic/Latitude]
   [#"^active$"                    bool-or-int-type :Semantic/Category]
   [#"^city$"                      text-type        :Semantic/City]
   [#"^country"                    text-type        :Semantic/Country]
   [#"_country$"                   text-type        :Semantic/Country]
   [#"^currency$"                  int-or-text-type :Semantic/Category]
   [#"^first(?:_?)name$"           text-type        :Semantic/Name]
   [#"^full(?:_?)name$"            text-type        :Semantic/Name]
   [#"^gender$"                    int-or-text-type :Semantic/Category]
   [#"^last(?:_?)name$"            text-type        :Semantic/Name]
   [#"^lat$"                       float-type       :Semantic/Latitude]
   [#"^latitude$"                  float-type       :Semantic/Latitude]
   [#"^lon$"                       float-type       :Semantic/Longitude]
   [#"^lng$"                       float-type       :Semantic/Longitude]
   [#"^long$"                      float-type       :Semantic/Longitude]
   [#"^longitude$"                 float-type       :Semantic/Longitude]
   [#"^name$"                      text-type        :Semantic/Name]
   [#"^postal(?:_?)code$"          int-or-text-type :Semantic/ZipCode]
   [#"^role$"                      int-or-text-type :Semantic/Category]
   [#"^sex$"                       int-or-text-type :Semantic/Category]
   [#"^status$"                    int-or-text-type :Semantic/Category]
   [#"^type$"                      int-or-text-type :Semantic/Category]
   [#"^url$"                       text-type        :Semantic/URL]
   [#"^zip(?:_?)code$"             int-or-text-type :Semantic/ZipCode]
   [#"discount"                    number-type      :Semantic/Discount]
   [#"income"                      number-type      :Semantic/Income]
   [#"quantity"                    int-type         :Semantic/Quantity]
   [#"count$"                      int-type         :Semantic/Quantity]
   [#"number"                      int-type         :Semantic/Quantity]
   [#"^num_"                       int-type         :Semantic/Quantity]
   [#"join"                        date-type        :Semantic/JoinDate]
   [#"join"                        time-type        :Semantic/JoinTime]
   [#"join"                        timestamp-type   :Semantic/JoinTimestamp]
   [#"create"                      date-type        :Semantic/CreationDate]
   [#"create"                      time-type        :Semantic/CreationTime]
   [#"create"                      timestamp-type   :Semantic/CreationTimestamp]
   [#"start"                       date-type        :Semantic/CreationDate]
   [#"start"                       time-type        :Semantic/CreationTime]
   [#"start"                       timestamp-type   :Semantic/CreationTimestamp]
   [#"cancel"                      date-type        :Semantic/CancelationDate]
   [#"cancel"                      time-type        :Semantic/CancelationTime]
   [#"cancel"                      timestamp-type   :Semantic/CancelationTimestamp]
   [#"delet(?:e|i)"                date-type        :Semantic/DeletionDate]
   [#"delet(?:e|i)"                time-type        :Semantic/DeletionTime]
   [#"delet(?:e|i)"                timestamp-type   :Semantic/DeletionTimestamp]
   [#"update"                      date-type        :Semantic/UpdatedDate]
   [#"update"                      time-type        :Semantic/UpdatedTime]
   [#"update"                      timestamp-type   :Semantic/UpdatedTimestamp]
   [#"source"                      int-or-text-type :Semantic/Source]
   [#"channel"                     int-or-text-type :Semantic/Source]
   [#"share"                       float-type       :Semantic/Share]
   [#"percent"                     float-type       :Semantic/Share]
   [#"rate$"                       float-type       :Semantic/Share]
   [#"margin"                      number-type      :Semantic/GrossMargin]
   [#"cost"                        number-type      :Semantic/Cost]
   [#"duration"                    number-type      :Semantic/Duration]
   [#"author"                      int-or-text-type :Semantic/Author]
   [#"creator"                     int-or-text-type :Semantic/Author]
   [#"created(?:_?)by"             int-or-text-type :Semantic/Author]
   [#"owner"                       int-or-text-type :Semantic/Owner]
   [#"company"                     int-or-text-type :Semantic/Company]
   [#"vendor"                      int-or-text-type :Semantic/Company]
   [#"subscription"                int-or-text-type :Semantic/Subscription]
   [#"score"                       number-type      :Semantic/Score]
   [#"rating"                      number-type      :Semantic/Score]
   [#"stars"                       number-type      :Semantic/Score]
   [#"description"                 text-type        :Semantic/Description]
   [#"title"                       text-type        :Semantic/Title]
   [#"comment"                     text-type        :Semantic/Comment]
   [#"birthda(?:te|y)"             timestamp-type   :Semantic/Birthdate]
   [#"(?:te|y)(?:_?)of(?:_?)birth" timestamp-type   :Semantic/Birthdate]])

;; Check that all the pattern tuples are valid
(when-not config/is-prod?
  (doseq [[name-pattern base-types semantic-type] pattern+base-types+semantic-type]
    (assert (instance? java.util.regex.Pattern name-pattern))
    (assert (every? #(isa? % :type/*) base-types))
    (assert (or (isa? semantic-type :Semantic/*)
                (isa? semantic-type :Relation/*)))))


(s/defn ^:private semantic-type-for-name-and-base-type :- (s/maybe su/FieldSemanticOrRelationType)
  "If `name` and `base-type` matches a known pattern, return the `semantic_type` we should assign to it."
  [field-name :- su/NonBlankString, base-type :- su/FieldDataType]
  (let [field-name (str/lower-case field-name)]
    (some (fn [[name-pattern valid-base-types semantic-type]]
            (when (and (some (partial isa? base-type) valid-base-types)
                       (re-find name-pattern field-name))
              semantic-type))
          pattern+base-types+semantic-type)))

(def ^:private FieldOrColumn
  "Schema that allows a `metabase.model.field/Field` or a column from a query resultset"
  {:name                           s/Str ; Some DBs such as MSSQL can return columns with blank name
   :base_type                      s/Keyword
   (s/optional-key :semantic_type) (s/maybe s/Keyword)
   s/Any                           s/Any})

(s/defn infer-semantic-type :- (s/maybe s/Keyword)
  "Classifer that infers the semantic type of a `field` based on its name and base type."
  [field-or-column :- FieldOrColumn]
  ;; Don't overwrite keys, else we're ok with overwriting as a new more precise type might have
  ;; been added.
  (when-not (or (some (partial isa? (:semantic_type field-or-column)) [:Relation/PK :Relation/FK])
                (str/blank? (:name field-or-column)))
    (semantic-type-for-name-and-base-type (:name field-or-column) (:base_type field-or-column))))

(s/defn infer-and-assoc-semantic-type  :- (s/maybe FieldOrColumn)
  "Returns `field-or-column` with a computed semantic type based on the name and base type of the `field-or-column`"
  [field-or-column :- FieldOrColumn, _ :- (s/maybe i/Fingerprint)]
  (when-let [inferred-semantic-type (infer-semantic-type field-or-column)]
    (log/debug (format "Based on the name of %s, we're giving it a semantic type of %s."
                       (sync-util/name-for-logging field-or-column)
                       inferred-semantic-type))
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
   [(prefix-or-postfix "vendor")       :entity/CompanyTable]])

(s/defn infer-entity-type :- i/TableInstance
  "Classifer that infers the semantic type of a TABLE based on its name."
  [table :- i/TableInstance]
  (let [table-name (-> table :name str/lower-case)]
    (assoc table :entity_type (or (some (fn [[pattern type]]
                                          (when (re-find pattern table-name)
                                            type))
                                        entity-types-patterns)
                                  (case (-> table
                                            :db_id
                                            Database
                                            :engine)
                                    :googleanalytics :entity/GoogleAnalyticsTable
                                    :druid           :entity/EventTable
                                    nil)
                                  :entity/GenericTable))))
