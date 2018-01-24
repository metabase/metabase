(ns metabase.sync.analyze.classifiers.name
  "Classifier that infers the special type of a Field based on its name and base type."
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field] :as field]
             [table :as table]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private bool-or-int-type #{:type/Boolean :type/Integer})
(def ^:private float-type       #{:type/Float})
(def ^:private int-type         #{:type/Integer})
(def ^:private int-or-text-type #{:type/Integer :type/Text})
(def ^:private text-type        #{:type/Text})
(def ^:private timestamp-type   #{:type/DateTime})
(def ^:private number-type      #{:type/Number})


(def ^:private pattern+base-types+special-type
  "Tuples of `[name-pattern set-of-valid-base-types special-type]`.
   Fields whose name matches the pattern and one of the base types should be given the special type.

   *  Convert field name to lowercase before matching against a pattern
   *  Consider a nil set-of-valid-base-types to mean \"match any base type\""
  [[#"^.*_lat$"           float-type       :type/Latitude]
   [#"^.*_lon$"           float-type       :type/Longitude]
   [#"^.*_lng$"           float-type       :type/Longitude]
   [#"^.*_long$"          float-type       :type/Longitude]
   [#"^.*_longitude$"     float-type       :type/Longitude]
   [#"^.*_type$"          int-or-text-type :type/Category]
   [#"^.*_url$"           text-type        :type/URL]
   [#"^_latitude$"        float-type       :type/Latitude]
   [#"^active$"           bool-or-int-type :type/Category]
   [#"^city$"             text-type        :type/City]
   [#"^country"           text-type        :type/Country]
   [#"^currency$"         int-or-text-type :type/Category]
   [#"^first(?:_?)name$"  text-type        :type/Name]
   [#"^full(?:_?)name$"   text-type        :type/Name]
   [#"^gender$"           int-or-text-type :type/Category]
   [#"^last(?:_?)name$"   text-type        :type/Name]
   [#"^lat$"              float-type       :type/Latitude]
   [#"^latitude$"         float-type       :type/Latitude]
   [#"^lon$"              float-type       :type/Longitude]
   [#"^lng$"              float-type       :type/Longitude]
   [#"^long$"             float-type       :type/Longitude]
   [#"^longitude$"        float-type       :type/Longitude]
   [#"^name$"             text-type        :type/Name]
   [#"^postal(?:_?)code$" int-or-text-type :type/ZipCode]
   [#"^role$"             int-or-text-type :type/Category]
   [#"^sex$"              int-or-text-type :type/Category]
   [#"^state$"            text-type        :type/State]
   [#"^status$"           int-or-text-type :type/Category]
   [#"^type$"             int-or-text-type :type/Category]
   [#"^url$"              text-type        :type/URL]
   [#"^zip(?:_?)code$"    int-or-text-type :type/ZipCode]
   [#"discount"           number-type      :type/Discount]
   [#"income"             number-type      :type/Income]
   [#"amount"             number-type      :type/Income]
   [#"^total"             number-type      :type/Income]
   [#"total$"             number-type      :type/Income]
   [#"quantity"           int-type         :type/Quantity]
   [#"count$"             int-type         :type/Quantity]
   [#"number"             int-type         :type/Quantity]
   [#"^num_"              int-type         :type/Quantity]
   [#"join"               timestamp-type   :type/JoinTimestamp]
   [#"create"             timestamp-type   :type/CreationTimestamp]
   [#"source"             int-or-text-type :type/Source]
   [#"channel"            int-or-text-type :type/Source]
   [#"share"              float-type       :type/Share]
   [#"percent"            float-type       :type/Share]
   [#"rate$"              float-type       :type/Share]
   [#"margin"             number-type      :type/GrossMargin]
   [#"cost"               number-type      :type/Cost]
   [#"duration"           number-type      :type/Duration]
   [#"author"             int-or-text-type :type/Author]
   [#"creator"            int-or-text-type :type/Author]
   [#"created(?:_?)by"    int-or-text-type :type/Author]
   [#"owner"              int-or-text-type :type/Owner]
   [#"company"            int-or-text-type :type/Company]
   [#"vendor"             int-or-text-type :type/Company]
   [#"subscription"       int-or-text-type :type/Subscription]
   [#"score"              number-type      :type/Score]
   [#"rating"             number-type      :type/Score]
   [#"stars"              number-type      :type/Score]
   [#"description"        text-type        :type/Description]
   [#"title"              text-type        :type/Title]
   [#"comment"            text-type        :type/Comment]])

;; Check that all the pattern tuples are valid
(when-not config/is-prod?
  (doseq [[name-pattern base-types special-type] pattern+base-types+special-type]
    (assert (instance? java.util.regex.Pattern name-pattern))
    (assert (every? (u/rpartial isa? :type/*) base-types))
    (assert (isa? special-type :type/*))))

(def ^:private ^{:arglists '([field-name base-type])} special-type-for-name-and-base-type
  "If `name` and `base-type` matches a known pattern, return the `special_type` we should assign to it.
   We memoize results primarily to make cases where there are a lot of schemas
   with identical structure (say one per user account) bearable."
  (memoize/lu
   (s/fn :- (s/maybe su/FieldType)
     [field-name :- su/NonBlankString, base-type :- su/FieldType]
     (or (when (= "id" (str/lower-case field-name))
           :type/PK)
         (some (fn [[name-pattern valid-base-types special-type]]
                 (when (and (some (partial isa? base-type) valid-base-types)
                            (re-find name-pattern (str/lower-case field-name)))
                   special-type))
               pattern+base-types+special-type)))
   :lu/threshold 10000))

(defn infer-special-type
  "Classifer that infers the special type of a FIELD based on its name and base type."
  [field _]
  (let [inferred-special-type (special-type-for-name-and-base-type (:name field) (:base_type field))]
    (if inferred-special-type
      (do
        (log/debug (format "Based on the name of %s, we're giving it a special type of %s."
                           (-> (field/->FieldInstance)
                               (merge field)
                               sync-util/name-for-logging)
                           inferred-special-type))
        (assoc field :special_type inferred-special-type))
      field)))

(def ^:private entity-types-patterns
  [[#"order"        :entity/TransactionTable]
   [#"transaction"  :entity/TransactionTable]
   [#"sale"         :entity/TransactionTable]
   [#"product"      :entity/ProductTable]
   [#"user"         :entity/UserTable]
   [#"account"      :entity/UserTable]
   [#"people"       :entity/UserTable]
   [#"person"       :entity/UserTable]
   [#"event"        :entity/EventTable]
   [#"checkin"      :entity/EventTable]
   [#"log"          :entity/EventTable]
   [#"subscription" :entity/SubscriptionTable]
   [#"company"      :entity/CompanyTable]
   [#"companies"    :entity/CompanyTable]
   [#"vendor"       :entity/CompanyTable]])

(def ^:private ^{:arglists '([table-name])} entity-type-for-name
  "If `table-name` matches a known pattern, return the `entity_type` we should assign to it.
   We memoize results primarily to make cases where there are a lot of schemas
   with identical structure (say one per user account) bearable."
  (memoize/lu
   (fn [table-name]
     (let [table-name (str/lower-case table-name)]
       (some (fn [[pattern type]]
               (when (re-find pattern table-name)
                 type))
             entity-types-patterns)))
   :lu/threshold 1000))

(defn infer-entity-type
  "Classifer that infers the entity type of a TABLE based on its name."
  [table]
  (let [entity-type (or (-> table :name entity-type-for-name)
                        (case (-> table
                                  :db_id
                                  Database
                                  :engine)
                          :googleanalytics :entity/GoogleAnalyticsTable
                          :druid           :entity/EventTable
                          :entity/GenericTable))]
    (log/debug (format "Based on the name of %s, we're giving it entity type %s."
                       (sync-util/name-for-logging (table/map->TableInstance table))
                       entity-type))
    (assoc table :entity_type entity-type)))
