(ns metabase.sync.metadata-sync.accept
  "What the receiver takes of an answer: the rows its entries give, as the app DB models expect them, and the answer
  without what this version cannot read or does not take.

  A sender can be of another version than the receiver, so the receiver reads each entry by itself and leaves out one
  it cannot read, a key, batch type or link kind it does not know, and a value that its models or its app DB columns
  do not take, and counts what it left out. Answers hold warehouse metadata, so nothing here logs them: the warning
  of what is left out holds counts only."
  (:require
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.sync.metadata-sync.links :as links]
   [metabase.sync.metadata-sync.tables :as tables]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Rows ------------------------------------------------

(def ^:private keyword-columns
  "The columns whose values an entry holds as strings and the app DB models expect as keywords."
  #{:base_type :effective_type :coercion_strategy :semantic_type :visibility_type :has_field_values
    :data_sensitivity :entity_type :data_layer :data_source :data_authority :field_order})

(defn- with-numbers
  "The fingerprint `fingerprint` with its number statistics read back as numbers. JSON carries NaN and Infinity as
  strings, and the Field model reads them back the same way when it reads a fingerprint."
  [fingerprint]
  (if (map? fingerprint)
    (m/update-existing-in fingerprint [:type :type/Number]
                          (fn [stats]
                            (if (map? stats)
                              (update-vals stats #(or (when (string? %) (parse-double %)) %))
                              stats)))
    fingerprint))

(defn row-value
  "The value of `column` in the entry `entry`, as the app DB models expect it. A value of the wrong kind stays as it
  is, or makes this throw: [[accepted-response]] then leaves it out."
  [entry column]
  (let [value (get entry column)]
    (cond
      (nil? value)                                   nil
      (and (keyword-columns column) (string? value)) (keyword value)
      (= column :last_analyzed)                      (u.date/parse value)
      (= column :fingerprint)                        (with-numbers value)
      :else                                          value)))

(defn- values-of
  "The value of each of `columns` that `entry` has one for, as the models expect it. A column the entry has no value
  for is left out, so the model gives it its default, as it does for a row that sync inserts."
  [columns entry]
  (into {}
        (keep (fn [column]
                (when-some [value (row-value entry column)]
                  [column value])))
        columns))

(defn table-row
  "The row of the Table that `entry` describes, in the Database with `database-id`. The Table counts as synced at
  once, since it has its metadata."
  [database-id entry]
  (merge (values-of (remove #{:schema :name} tables/table-columns) entry)
         {:db_id               database-id
          :schema              (:schema entry)
          :name                (:name entry)
          :active              true
          :initial_sync_status "complete"}))

(defn field-row
  "The row of the Field that `field-entry` describes, in the Table with `table-id`, under the Field with `parent-id`
  or at the top."
  [table-id parent-id {:keys [path] :as field-entry}]
  (let [row (values-of tables/field-columns field-entry)]
    (cond-> (assoc row :table_id table-id :parent_id parent-id :name (peek path) :active true)
      ;; Without a coercion, the effective type is the base type, as sync writes it.
      (nil? (:coercion_strategy row)) (assoc :effective_type (:base_type row)))))

;;; ------------------------------------------------ Values ------------------------------------------------

(def ^:private enum-columns
  "The values of the columns that a model takes as any keyword, by model. The models' transforms check the others."
  {:model/Field {:visibility_type  (set lib.schema.metadata/column-visibility-types)
                 :has_field_values (set lib.schema.metadata/column-has-field-values-options)
                 :data_sensitivity (set lib.schema.metadata/column-data-sensitivity-types)}
   :model/Table {:field_order     table/field-orderings
                 ;; the model takes the others too, but they say how one instance made the Table
                 :data_source     (into #{} (map keyword) tables/sent-data-sources)}})

(defn- row-as-written
  "`row` of `model` with the model's transforms applied to each value. Throws when a transform refuses a value, as an
  insert through the model does."
  [model row]
  (reduce-kv (fn [row column {to-db :in}]
               (cond-> row
                 (and to-db (some? (get row column))) (update column to-db)))
             row
             (t2/transforms model)))

(def ^:private string-limits
  "The most characters that this version's app DB holds in each string column with a limit that an answer fills, by
  model, on every kind of app DB: a Table name holds 256 on H2 and Postgres, and 254 on MySQL. A newer version can
  have a wider column."
  {:model/Database {:timezone 254}
   :model/Table    {:schema 254 :name 254 :display_name 256 :entity_type 254 :data_layer 254
                    :data_source 254 :data_authority 20 :field_order 254}
   :model/Field    {:name 254 :display_name 254 :base_type 255 :effective_type 255 :semantic_type 255
                    :coercion_strategy 255 :visibility_type 32 :data_sensitivity 32 :nfc_path 254}})

(def ^:private int-columns
  "The 32-bit integer columns that an entry fills, by model."
  {:model/Field #{:position :database_position :custom_position :fingerprint_version}})

(defn- fits-app-db?
  "Whether this version's app DB holds each value of `written`, a row of `model` as the model writes it."
  [model written]
  (and (every? (fn [[column limit]]
                 (let [value (get written column)]
                   (or (nil? value) (<= (count (u/qualified-name value)) limit))))
               (string-limits model))
       (every? (fn [column]
                 (let [value (get written column)]
                   (or (not (int? value)) (<= Integer/MIN_VALUE value Integer/MAX_VALUE))))
               (int-columns model))))

(defn- accepted-row?
  "Whether this Metabase's `model` takes `row`: it has the shape of `row-schema`, its [[enum-columns]] have values
  this version knows, the model's transforms take its values, and the app DB holds them. A transform throws for a
  type that this version does not know."
  [model row-schema row]
  (and (mr/validate row-schema row)
       (every? (fn [[column allowed]]
                 (let [value (get row column)]
                   (or (nil? value) (contains? allowed value))))
               (enum-columns model))
       (some->> (row-as-written model row) (fits-app-db? model))))

(mr/def ::field-row
  "A Field row that an entry gives, before its Table has an id: what creating a Field takes, without the Table."
  (mut/dissoc ::warehouse-schema.schema/field.create :table_id))

(defn- table-accepted?
  "Whether the row that the Table entry `entry` gives is one this Metabase takes for the Database with `database-id`."
  [database-id entry]
  (try
    (accepted-row? :model/Table ::warehouse-schema.schema/table.create (table-row database-id entry))
    (catch Exception _
      false)))

(defn- field-accepted?
  "Whether the row that the Field entry `entry` gives is one this Metabase takes."
  [entry]
  (try
    (accepted-row? :model/Field ::field-row (dissoc (field-row nil nil (update entry :path vec)) :table_id))
    (catch Exception _
      false)))

(def ^:private table-column-groups
  "The columns of a Table entry that are left out together when this Metabase does not take one of them."
  (into []
        (map vector)
        (remove #{:schema :name} tables/table-columns)))

(def ^:private field-column-groups
  "The columns of a Field entry that are left out together when this Metabase does not take one of them. A coercion
  and the effective type it gives go together. A fingerprint goes with its version and time: sync fingerprints a
  Field again only when its version is older, so a version without its fingerprint would keep it from ever having
  one."
  (into [[:coercion_strategy :effective_type]
         [:fingerprint :fingerprint_version :last_analyzed]]
        (map vector)
        (remove #{:base_type :database_type :coercion_strategy :effective_type
                  :fingerprint :fingerprint_version :last_analyzed}
                tables/field-columns)))

(defn- without-unaccepted
  "`[entry dropped]`: `entry` without each of the column `groups` that `accepted?` does not take next to the columns
  `base-keys`, and the set of columns it left out, or nil when it does not take the base columns, or the rest."
  [accepted? entry base-keys groups]
  (if (accepted? entry)
    [entry #{}]
    (let [base (select-keys entry (conj base-keys :path))]
      (when (accepted? base)
        (let [dropped (into []
                            (comp (filter (fn [group]
                                            (and (some #(contains? entry %) group)
                                                 (not (accepted? (merge base (select-keys entry group)))))))
                                  cat
                                  (filter #(contains? entry %)))
                            groups)
              kept    (apply dissoc entry dropped)]
          (when (accepted? kept)
            [kept (set dropped)]))))))

(defn- with-known-user-set
  "`[entry count]`: `entry`, from which the columns `dropped` were left out, with a `user_set` that names only columns
  among `known` and none of `dropped`, and how many columns and names it left out."
  [[entry dropped] known]
  (let [user-set (:user_set entry)
        kept     (filterv #(and (contains? known %) (not (contains? dropped (keyword %)))) user-set)]
    [(if (seq kept) (assoc entry :user_set kept) (dissoc entry :user_set))
     (+ (count dropped) (- (count user-set) (count kept)))]))

(defn- accepted-field
  "`[entry dropped]` for the Field entry `entry` as this Metabase takes it, or nil when it takes no row for it. A base
  type this version does not know is the unknown type, as sync gives a column of a type it does not know."
  [entry]
  (let [cleaned (or (without-unaccepted field-accepted? entry [:base_type :database_type] field-column-groups)
                    (some-> (without-unaccepted field-accepted? (assoc entry :base_type "type/*")
                                                [:base_type :database_type] field-column-groups)
                            (update 1 conj :base_type)))]
    (when cleaned
      (with-known-user-set cleaned (set tables/field-user-set-columns)))))

(defn- accepted-table
  "`[entry dropped]` for the Table entry `entry` as this Metabase takes it for the Database with `database-id`, with
  its Fields, or nil when it takes no row for the Table or one of its Fields."
  [database-id entry]
  (let [table  (without-unaccepted #(table-accepted? database-id %) (dissoc entry :fields) [:schema :name]
                                   table-column-groups)
        fields (map accepted-field (:fields entry))]
    (when (and table (every? some? fields))
      (let [[table-entry dropped] (with-known-user-set table (set tables/table-user-set-columns))]
        [(assoc table-entry :fields (mapv first fields))
         (transduce (map second) + dropped fields)]))))

;;; ------------------------------------------------ Entries ------------------------------------------------

(mr/def ::entries-batch
  [:map [:tables [:sequential :any]]])

(mr/def ::links-entry
  "A links entry as the receiver first checks it: each of its links is then checked by itself."
  [:map
   [:schema {:optional true} [:maybe :string]]
   [:name   ms/NonBlankString]
   [:links  {:optional true} [:maybe [:sequential :any]]]])

(defn- broken-field-paths?
  "Whether the Fields of the Table entry `table` have a path twice, or a nested Field whose parent is not there."
  [table]
  (let [paths (mapv (comp vec :path) (:fields table))
        known (set paths)]
    (or (not= (count paths) (count known))
        (some #(and (next %) (not (known (pop %)))) paths))))

(defn- table-entry? [entry]
  (and (mr/validate ::tables/table entry)
       (not (broken-field-paths? entry))))

(defn- accepted-links
  "`[entries left-out]`: the links entries `entries` with only the FK links of the right shape, and how many entries
  and links it left out."
  [entries]
  (let [readable (filterv #(mr/validate ::links-entry %) entries)
        kept     (for [entry readable]
                   (assoc entry :links (filterv #(mr/validate ::links/fk-link %) (:links entry))))]
    [(filterv (comp seq :links) kept)
     (+ (- (count entries) (count readable))
        (- (transduce (map (comp count :links)) + 0 readable)
           (transduce (map (comp count :links)) + 0 kept)))]))

(defn- accepted-database
  "The database `batch` without a value that this version's app DB cannot hold, and how many it left out."
  [batch]
  (let [too-long (filterv #(not (fits-app-db? :model/Database (select-keys batch [%])))
                          (keys (string-limits :model/Database)))]
    [(apply dissoc batch too-long) (count too-long)]))

(def ^:private none
  {:values_dropped 0 :tables_skipped 0 :left_out 0})

(defn- accepted-batch
  "`[batch counts]`: the batch as this Metabase applies it to the Database with `database-id`, without the entries,
  values and links it does not take or cannot read, and counts of what it left out; or nil for a batch of a type it
  does not know, or one it cannot read."
  [database-id {batch-type :type :as batch}]
  (case batch-type
    "database" (when (mr/validate ::wire/database-batch batch)
                 (let [[batch dropped] (accepted-database batch)]
                   [batch (assoc none :values_dropped dropped)]))
    "tables"   (when (mr/validate ::entries-batch batch)
                 (let [[readable unreadable] ((juxt filter remove) table-entry? (:tables batch))
                       accepted              (mapv #(accepted-table database-id %) readable)]
                   [(assoc batch :tables (into [] (comp (keep identity) (map first)) accepted))
                    (assoc none
                           :values_dropped (transduce (keep second) + 0 accepted)
                           :tables_skipped (+ (count unreadable) (count (remove some? accepted))))]))
    "links"    (when (mr/validate ::entries-batch batch)
                 (let [[entries left-out] (accepted-links (:tables batch))]
                   [(assoc batch :tables entries) (assoc none :left_out left-out)]))
    "stats"    (when (mr/validate ::entries-batch batch)
                 (let [[readable unreadable] ((juxt filter remove) #(mr/validate ::wire/stats-table %) (:tables batch))]
                   [(assoc batch :tables (vec readable)) (assoc none :left_out (count unreadable))]))
    nil))

(defn accepted-response
  "`{:response .. :counts ..}`: `response` as this Metabase applies it to the Database with `database-id`, and the
  counts of what it left out: values (`values_dropped`), Tables with their Fields (`tables_skipped`), and batches,
  links and stats entries (`left_out`) that only a newer version sends, that this version does not take, or that it
  cannot read. The counts are logged, and hold none of the answer's values."
  [database-id response]
  (let [accepted (map #(accepted-batch database-id %) (:batches response))
        batches  (count (remove some? accepted))
        counts   (update (reduce (partial merge-with +) none (keep second accepted)) :left_out + batches)]
    (when (some pos? (vals counts))
      (log/warnf (str "An answer for Database %d holds what this version does not apply, which it leaves out:"
                      " %d values, %d Tables, and %d batches, links or stats entries")
                 database-id (:values_dropped counts) (:tables_skipped counts) (:left_out counts)))
    {:response (assoc response :batches (into [] (comp (keep identity) (map first)) accepted))
     :counts   counts}))
