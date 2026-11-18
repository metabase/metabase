(ns metabase.analyze.classifiers.table-role
  "Classifier that proposes a Table's role, i.e. how the table is built: a fact, a dimension, a bridge, and so on.
  Roles are the `:role/*` keywords in `metabase.types.core/table-role-hierarchy`.

  Nothing calls this during sync and nothing stores its result yet: the next step is a nullable `table_role` column
  on `metabase_table`, with a twin in `metabase_table_user_settings` so an admin's choice wins over sync."
  (:refer-clojure :exclude [some every?])
  (:require
   [metabase.analyze.classifiers.field-signals :as signals :refer [named? pk? fk? temporal?]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [some every?]]))

(def ^:private RoleInference
  [:map {:closed true}
   [:role       [:and :keyword [:fn {:error/message "a :role/* keyword"} #(= "role" (namespace %))]]]
   [:signal     :string]
   [:confidence [:enum :high :low]]])

(def ^:private index-pattern        #"(?:^|_)(?:index|idx|position|pos|seq|sequence|ordinal)$")
(def ^:private created-pattern      #"^(?:created_at|created|created_on|inserted_at)$")
(def ^:private updated-pattern      #"^(?:updated_at|updated|updated_on|modified_at|last_modified)$")
(def ^:private label-pattern        #"^(?:name|label|code|title|description|display_name)$")
(def ^:private status-pattern       #"(?:^|_)(?:status|stage|phase|result|outcome)$")
;; `state` is as often an address as a lifecycle state, so it only counts on text columns
(def ^:private state-pattern        #"(?:^|_)state$")
(def ^:private milestone-pattern    #"^(?:[a-z]+ed|paid|sent|won|lost|begun|done)_(?:at|on|date|time)$")
(def ^:private bookkeeping-pattern
  #"^(?:created|updated|modified|deleted|inserted|loaded|synced|extracted|ingested|processed|refreshed)_")

(def ^:private name-rules
  "Tuples of `[table-name-pattern role confidence]`, tried in order. Warehouse prefixes are strong signals."
  [[#"^(?:_fivetran|fivetran_|dbt_)|_audit$"                                 :role/SystemTable          :high]
   [#"^(?:dim_|d_)"                                                         :role/EntityDimension      :high]
   [#"^(?:fct_|fact_|f_)"                                                   :role/TransactionFact      :high]
   [#"^agg_"                                                                :role/AggregateFact        :high]
   [#"^hub_"                                                                :role/Hub                  :high]
   [#"^sat_"                                                                :role/Satellite            :high]
   [#"^(?:lnk_|link_)"                                                      :role/Link                 :high]
   [#"_(?:history|snapshots?|versions?)$"                                   :role/HistoryDimension     :low]
   [#"_(?:summary|totals|rollup)$"                                          :role/AggregateFact        :low]
   [#"_(?:report|daily|weekly|monthly|stats)$"                              :role/PeriodicSnapshotFact :low]
   [#"_(?:translations?|i18n|locales?)$"                                    :role/TranslationTable     :low]
   [#"custom_fields?|property_values?|_properties$"                         :role/CustomPropertyTable  :low]
   [#"(?:^|_)(?:settings|config|configuration|preferences)$"                :role/ConfigurationTable   :low]
   [#"(?:^|_)(?:events?|logs?|checkins?|clicks?|pageviews?|activit(?:y|ies))$" :role/EventFact        :low]
   [#"(?:^|_)(?:orders?|order_lines?|transactions?|sales?|payments?|invoices?)$" :role/TransactionFact :low]
   [#"(?:^|_)(?:users?|accounts?|people|persons?|customers?|employees?|products?|companies|company|vendors?|deals?|tickets?)$"
    :role/EntityDimension :low]
   [#"(?:^|_)(?:types|statuses|categories|codes)$"                          :role/LookupDimension      :low]])

(defn- status? [field]
  (and (not (temporal? field))
       (not (signals/data-type-isa? field :type/Boolean))
       (not (signals/semantic-type-isa? field :type/State))
       (or (signals/semantic-type-isa? field :type/Status)
           (and (or (signals/data-type-isa? field :type/Text) (signals/data-type-isa? field :type/Number))
                (named? status-pattern field))
           (and (signals/data-type-isa? field :type/Text)
                (named? state-pattern field)))))

(defn- milestone? [field]
  (and (temporal? field)
       (named? milestone-pattern field)
       (not (named? bookkeeping-pattern field))))

(defn- inference [role signal confidence]
  {:role role, :signal signal, :confidence confidence})

(defn- infer-from-keys [fields]
  (let [pks (filter pk? fields)
        fks (filter fk? fields)]
    (or (when (and (>= (count fks) 2)
                   (every? #(or (pk? %) (fk? %)) fields))
          (inference :role/Bridge (tru "every column is a key, linking {0} tables" (count fks)) :high))
        (when-let [index-key (when (= (count fks) 1)
                               (some #(when (named? index-pattern %) %) pks))]
          (inference :role/ArrayChild
                     (tru "its key is {0} plus the position {1}" (:name (first fks)) (:name index-key))
                     :high))
        (when (>= (count pks) 2)
          (let [date-key (some #(when (temporal? %) %) pks)]
            (or (when (and date-key
                           (every? #(or (identical? % date-key) (fk? %)) pks))
                  (inference :role/PeriodicSnapshotFact
                             (tru "its key is the date {0} plus foreign keys" (:name date-key))
                             :high))
                (when-let [version-key (or date-key (signals/first-named signals/version-key-pattern pks))]
                  (inference :role/HistoryDimension
                             (tru "its key is an ID plus {0}" (:name version-key))
                             :high))))))))

(defn- infer-custom-property-role [fields]
  (let [value-field    (signals/first-named signals/value-pattern fields)
        property-field (some #(when (and (not (pk? %)) (named? signals/property-pattern %)) %) fields)
        entity-key     (some #(when (and (fk? %) (not (identical? % property-field))) %) fields)
        label-field    (signals/first-named-by-priority signals/definition-label-patterns fields)
        type-field     (signals/first-named signals/definition-type-pattern fields)]
    (cond
      (and value-field property-field entity-key)
      (inference :role/CustomPropertyTable
                 (tru "it has {0}, {1} and {2} columns" (:name entity-key) (:name property-field) (:name value-field))
                 :high)

      ;; a table of field definitions; a plain `name` next to a `type` is too common to count
      (and label-field type-field (not= "name" (signals/field-name label-field)))
      (inference :role/ConfigurationTable
                 (tru "it has {0} and {1} columns, like a table of field definitions"
                      (:name label-field) (:name type-field))
                 :low))))

(defn- infer-from-columns [fields]
  (let [pks         (filter pk? fields)
        fks         (filter fk? fields)
        dates       (filter temporal? fields)
        non-keys    (remove pk? fields)
        updated-at? (some #(named? updated-pattern %) fields)]
    (or (infer-custom-property-role fields)
        (let [valid-from (some #(when (signals/valid-from? %) %) fields)
              valid-to   (some #(when (signals/valid-to? %) %) fields)]
          (when (and valid-from valid-to)
            (inference :role/HistoryDimension
                       (tru "it has {0} and {1} columns" (:name valid-from) (:name valid-to))
                       :high)))
        (let [milestones (filter milestone? fields)
              status     (some #(when (status? %) %) fields)]
          (when (and (>= (count milestones) 2) status)
            (inference :role/AccumulatingSnapshotFact
                       (tru "it has {0} milestone dates and {1}" (count milestones) (:name status))
                       :low)))
        (when (and (<= (count pks) 1)
                   (<= (count fields) 5)
                   (seq non-keys)
                   (every? #(named? label-pattern %) non-keys))
          (inference :role/LookupDimension (tru "it only has a key and label columns") :low))
        (when (and (= (count dates) 1)
                   (not updated-at?)
                   (seq fks))
          (inference :role/EventFact
                     (tru "it has one timestamp, no updated_at, and a link to {0}" (:name (first fks)))
                     :low))
        (when (and (= (count pks) 1)
                   (some #(named? label-pattern %) fields)
                   (some #(named? created-pattern %) fields)
                   updated-at?)
          (inference :role/EntityDimension (tru "it has a single key, a name, and created and updated dates") :low)))))

(defn- infer-from-name [table-name]
  (let [table-name (u/lower-case-en table-name)]
    (some (fn [[pattern role confidence]]
            (when (re-find pattern table-name)
              (inference role (tru "its name {0} matches the naming pattern of a {1} table" table-name (name role))
                         confidence)))
          name-rules)))

(mu/defn infer-table-role :- [:maybe RoleInference]
  "Propose a role for the Table named `table-name` from its `fields`. Signals are tried strongest first: the shape of
  the keys, then the columns, then the table name. Returns the role, a one-line reason for an admin, and whether
  the guess is confident enough to apply without review; nil when no signal matches."
  [table-name :- :string
   fields     :- [:sequential signals/Field]]
  (or (infer-from-keys fields)
      (infer-from-columns fields)
      (infer-from-name table-name)))
