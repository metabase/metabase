(ns metabase.analyze.classifiers.history
  "Classifier that reads a history table, which keeps one row per version of an entity: it proposes the table's
  slowly-changing-dimension (SCD) type and the binding that names the columns tying the versions together.

  Nothing calls this during sync and nothing stores its result yet: the next step is a nullable `scd_type` column and
  a nullable `history_definition` JSON column on `metabase_table`, each with a twin in `metabase_table_user_settings`
  so an admin's choice wins over sync."
  (:refer-clojure :exclude [some])
  (:require
   [clojure.string :as str]
   [metabase.analyze.classifiers.field-signals :as signals :refer [named? pk? temporal?]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [some]]))

(def ^:private HistoryBinding
  "Field IDs of the columns that make a history table work; nil where the table has no such column."
  [:map {:closed true}
   [:durable_key  [:maybe pos-int?]]
   [:valid_from   [:maybe pos-int?]]
   [:valid_to     [:maybe pos-int?]]
   [:current_flag [:maybe pos-int?]]
   [:version      [:maybe pos-int?]]])

(def ^:private HistoryInference
  [:map {:closed true}
   [:scd_type   [:enum 2 6]]
   [:binding    HistoryBinding]
   [:signal     :string]
   [:confidence [:enum :high :low]]])

(def ^:private fivetran-start-pattern  #"^_fivetran_start$")
(def ^:private fivetran-end-pattern    #"^_fivetran_end$")
(def ^:private dbt-valid-from-pattern  #"^dbt_valid_from$")
(def ^:private dbt-valid-to-pattern    #"^dbt_valid_to$")
(def ^:private key-version-pattern     #"(?:^|_)(?:updated_at|version|revision)$")
(def ^:private history-name-pattern    #"_(?:history|snapshots?|versions?)$")
(def ^:private version-pattern         #"(?:^|_)(?:version|revision|etag)$")
(def ^:private id-pattern              #"^id$")
(def ^:private entity-id-pattern       #"^(?!dbt_|_fivetran_).+_id$")
(def ^:private current-flag-pattern    #"^(?:is_current|current_flag|is_latest|active|is_active|_fivetran_active)$")
(def ^:private start-date-pattern
  #"(?:^|_)(?:start_date|start_at|started_at|starts_at|start_time|valid_start|from_date|date_from|changed_at|entered_at)$")
(def ^:private end-date-pattern
  #"(?:^|_)(?:end_at|ended_at|ends_at|end_time|valid_end|to_date|date_to|exited_at|left_at)$")
;; load and edit bookkeeping: when the row was written, not when the version began
(def ^:private bookkeeping-date-pattern
  #"^(?:_fivetran_synced|_fivetran_deleted|_fivetran_end|_loaded_at|_sdc_.*|_airbyte_.*|last_modified)$|(?:^|_)(?:updated|modified|deleted|synced|loaded|extracted)(?:_at|_on|_date|_time)?$")
(def ^:private current-value-patterns  [#"^current_(.+)$" #"^(.+)_current$"])

(defn- first-with-semantic-type-or-name
  "The first of `fields` typed as `semantic-type`, else the first whose name matches `pattern`."
  [semantic-type pattern fields]
  (or (some #(when (signals/semantic-type-isa? % semantic-type) %) fields)
      (signals/first-named pattern fields)))

(defn- version-key? [field]
  (or (temporal? field)
      (signals/semantic-type-isa? field :type/Version)
      (named? key-version-pattern field)))

(defn- key-shape
  "`[id-key version-key]` when the primary key is an ID plus a date or version column."
  [fields]
  (let [pks (filter pk? fields)]
    (when (>= (count pks) 2)
      (let [version-key (some #(when (version-key? %) %) pks)
            id-key      (some #(when-not (or (identical? % version-key) (temporal? %)) %) pks)]
        (when (and version-key id-key)
          [id-key version-key])))))

(defn- both-named [from-pattern to-pattern fields]
  (let [from (signals/first-named from-pattern fields)
        to   (signals/first-named to-pattern fields)]
    (when (and from to)
      [from to])))

(defn- scd2-inference [signal confidence]
  {:scd_type 2, :signal signal, :confidence confidence})

(defn- infer-scd2
  "Why the table keeps one row per version, strongest signal first; nil when nothing but its role says so."
  [table-name fields]
  (or (when-let [[start end] (both-named fivetran-start-pattern fivetran-end-pattern fields)]
        (scd2-inference (tru "it has {0} and {1}, the Fivetran history mode columns" (:name start) (:name end)) :high))
      (when-let [[from to] (both-named dbt-valid-from-pattern dbt-valid-to-pattern fields)]
        (scd2-inference (tru "it has {0} and {1}, the dbt snapshot columns" (:name from) (:name to)) :high))
      (let [from (some #(when (signals/valid-from? %) %) fields)
            to   (some #(when (signals/valid-to? %) %) fields)]
        (when (and from to)
          (scd2-inference (tru "it has the date range columns {0} and {1}" (:name from) (:name to)) :high)))
      (when-let [[id-key version-key] (key-shape fields)]
        (scd2-inference (tru "its key is {0} plus {1}, so each row is a version and the latest row per {2} is current"
                             (:name id-key) (:name version-key) (:name id-key))
                        :low))
      (when (re-find history-name-pattern (u/lower-case-en table-name))
        (scd2-inference (tru "its name {0} ends like a history table" table-name) :low))))

(defn- current-value-fields
  "Columns named like the current value of a sibling column, e.g. `current_title` next to `title`: SCD type 6."
  [fields]
  (let [names (set (map signals/field-name fields))]
    (filter (fn [field]
              (some (fn [pattern]
                      (when-let [[_ base-name] (re-matches pattern (signals/field-name field))]
                        (contains? names base-name)))
                    current-value-patterns))
            fields)))

(defn- durable-key [fields key-pair]
  (let [non-keys (remove pk? fields)]
    (or (some #(when (signals/semantic-type-isa? % :type/DurableKey) %) fields)
        (first key-pair)
        ;; in a dimensional model the PK is a surrogate key and the entity's own ID sits next to it
        (signals/first-named id-pattern non-keys)
        (signals/first-named entity-id-pattern non-keys)
        (some #(when (pk? %) %) fields))))

(defn- time-column
  "The table's own date, as the start of each version when no column is named like one."
  [fields valid-to]
  (let [dates (filter #(and (temporal? %) (not (identical? % valid-to))) fields)]
    (or (some #(when-not (or (named? bookkeeping-date-pattern %)
                             (signals/semantic-type-isa? % :type/LoadTimestamp))
                 %)
              dates)
        (first dates))))

(defn- infer-binding [fields]
  (let [key-pair    (key-shape fields)
        key-version (second key-pair)
        named-from  (some #(when (signals/valid-from? %) %) fields)
        valid-to    (or (some #(when (signals/valid-to? %) %) fields)
                        (signals/first-named end-date-pattern fields))
        valid-from  (or named-from
                        (signals/first-named start-date-pattern fields)
                        ;; `id + updated_at` keys: each version starts when it was written
                        (when (and (not valid-to) key-version (temporal? key-version))
                          key-version)
                        (time-column fields valid-to))]
    {:durable_key  (:id (durable-key fields key-pair))
     :valid_from   (:id valid-from)
     :valid_to     (:id valid-to)
     :current_flag (:id (first-with-semantic-type-or-name :type/CurrentRowFlag current-flag-pattern fields))
     :version      (:id (or (first-with-semantic-type-or-name :type/Version version-pattern fields)
                            ;; an explicit interval dates the versions; otherwise the key's date or counter does
                            (when-not named-from key-version)))}))

(mu/defn infer-history :- [:maybe HistoryInference]
  "Propose how to read the Table named `table-name` as a history of versions, given its `fields` and its `role` (as
  inferred or set by an admin). Returns nil unless `role` is `:role/HistoryDimension`.

  Returns the SCD type (2, or 6 when columns also carry each entity's current value), the binding (field IDs of the
  durable key, valid-from, valid-to, current-row flag and version, each nil when no column fits), a one-line reason
  for an admin, and whether the SCD type is confident enough to apply without review."
  [table-name :- :string
   role       :- [:maybe :keyword]
   fields     :- [:sequential signals/FieldWithId]]
  ;; `=`, not `isa?`: `:role/HistoryDimension` has no descendants (a test guards this)
  (when (= role :role/HistoryDimension)
    (let [current-values (current-value-fields fields)]
      (assoc (if (seq current-values)
               {:scd_type   6
                :signal     (tru "{0} hold the current value on every version"
                                 (str/join ", " (map :name current-values)))
                :confidence :high}
               (or (infer-scd2 table-name fields)
                   (scd2-inference (tru "it is a history table, so each row is a version") :low)))
             :binding (infer-binding fields)))))
