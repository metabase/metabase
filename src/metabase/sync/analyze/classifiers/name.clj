(ns metabase.sync.analyze.classifiers.name
  "Classifier that infers the special type of a Field based on its name and base type."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models
             [field :refer [Field]]
             [database :refer [Database]]]
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
  [[#"^.*_lat$"                    float-type       :type/Latitude]
   [#"^.*_lon$"                    float-type       :type/Longitude]
   [#"^.*_lng$"                    float-type       :type/Longitude]
   [#"^.*_long$"                   float-type       :type/Longitude]
   [#"^.*_longitude$"              float-type       :type/Longitude]
   [#"^.*_type$"                   int-or-text-type :type/Category]
   [#"^.*_url$"                    text-type        :type/URL]
   [#"^_latitude$"                 float-type       :type/Latitude]
   [#"^active$"                    bool-or-int-type :type/Category]
   [#"^city$"                      text-type        :type/City]
   [#"^country"                    text-type        :type/Country]
   [#"^currency$"                  int-or-text-type :type/Category]
   [#"^first(?:_?)name$"           text-type        :type/Name]
   [#"^full(?:_?)name$"            text-type        :type/Name]
   [#"^gender$"                    int-or-text-type :type/Category]
   [#"^last(?:_?)name$"            text-type        :type/Name]
   [#"^lat$"                       float-type       :type/Latitude]
   [#"^latitude$"                  float-type       :type/Latitude]
   [#"^lon$"                       float-type       :type/Longitude]
   [#"^lng$"                       float-type       :type/Longitude]
   [#"^long$"                      float-type       :type/Longitude]
   [#"^longitude$"                 float-type       :type/Longitude]
   [#"^name$"                      text-type        :type/Name]
   [#"^postal(?:_?)code$"          int-or-text-type :type/ZipCode]
   [#"^role$"                      int-or-text-type :type/Category]
   [#"^sex$"                       int-or-text-type :type/Category]
   [#"^state$"                     text-type        :type/State]
   [#"^status$"                    int-or-text-type :type/Category]
   [#"^type$"                      int-or-text-type :type/Category]
   [#"^url$"                       text-type        :type/URL]
   [#"^zip(?:_?)code$"             int-or-text-type :type/ZipCode]
   [#"discount"                    number-type      :type/Discount]
   [#"income"                      number-type      :type/Income]
   [#"amount"                      number-type      :type/Income]
   [#"^total"                      number-type      :type/Income]
   [#"_total$"                     number-type      :type/Income]
   [#"quantity"                    int-type         :type/Quantity]
   [#"count$"                      int-type         :type/Quantity]
   [#"number"                      int-type         :type/Quantity]
   [#"^num_"                       int-type         :type/Quantity]
   [#"join"                        timestamp-type   :type/JoinTimestamp]
   [#"create"                      timestamp-type   :type/CreationTimestamp]
   [#"source"                      int-or-text-type :type/Source]
   [#"channel"                     int-or-text-type :type/Source]
   [#"share"                       float-type       :type/Share]
   [#"percent"                     float-type       :type/Share]
   [#"rate$"                       float-type       :type/Share]
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
   [#"rating"                      number-type      :type/Score]
   [#"stars"                       number-type      :type/Score]
   [#"description"                 text-type        :type/Description]
   [#"title"                       text-type        :type/Title]
   [#"comment"                     text-type        :type/Comment]
   [#"birthda(?:te|y)"             timestamp-type   :type/Birthdate]
   [#"(?:te|y)(?:_?)or(?:_?)birth" timestamp-type   :type/Birthdate]])

;; Check that all the pattern tuples are valid
(when-not config/is-prod?
  (doseq [[name-pattern base-types special-type] pattern+base-types+special-type]
    (assert (instance? java.util.regex.Pattern name-pattern))
    (assert (every? (u/rpartial isa? :type/*) base-types))
    (assert (isa? special-type :type/*))))


(s/defn ^:private special-type-for-name-and-base-type :- (s/maybe su/FieldType)
  "If `name` and `base-type` matches a known pattern, return the `special_type` we should assign to it."
  [field-name :- su/NonBlankString, base-type :- su/FieldType]
  (or (when (= "id" (str/lower-case field-name)) :type/PK)
      (some (fn [[name-pattern valid-base-types special-type]]
              (when (and (some (partial isa? base-type) valid-base-types)
                         (re-find name-pattern (str/lower-case field-name)))
                special-type))
            pattern+base-types+special-type)))

(s/defn infer-special-type :- (s/maybe i/FieldInstance)
  "Classifer that infers the special type of a FIELD based on its name and base type."
  [field :- i/FieldInstance, _ :- (s/maybe i/Fingerprint)]
  (when-let [inferred-special-type (special-type-for-name-and-base-type (:name field) (:base_type field))]
    (log/debug (format "Based on the name of %s, we're giving it a special type of %s."
                       (sync-util/name-for-logging field)
                       inferred-special-type))
    (assoc field :special_type inferred-special-type)))

(def ^:private entity-types-patterns
  [[#"order"        :entity/TransactionTable]
   [#"transaction"  :entity/TransactionTable]
   [#"sale"         :entity/TransactionTable]
   [#"product"      :entity/ProductTable]
   [#"user"         :entity/UserTable]
   [#"account"      :entity/UserTable]
   [#"people"       :entity/UserTable]
   [#"person"       :entity/UserTable]
   [#"employee"     :entity/UserTable]
   [#"event"        :entity/EventTable]
   [#"checkin"      :entity/EventTable]
   [#"log"          :entity/EventTable]
   [#"subscription" :entity/SubscriptionTable]
   [#"company"      :entity/CompanyTable]
   [#"companies"    :entity/CompanyTable]
   [#"vendor"       :entity/CompanyTable]])

(s/defn infer-entity-type :- i/TableInstance
  "Classifer that infers the special type of a TABLE based on its name."
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
