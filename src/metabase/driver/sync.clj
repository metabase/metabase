(ns metabase.driver.sync
  "The logic for doing DB and Table syncing itself."
  (:require [clojure.math.numeric-tower :as math]
            (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [cheshire.core :as json]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.driver [interface :refer :all]
                             [query-processor :as qp])
            [metabase.driver.sync.queries :as queries]
            (metabase.models [common :as common]
                             [field :refer [Field] :as field]
                             [field-values :as field-values]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.util :as u]))

(declare auto-assign-field-special-type-by-name!
         mark-category-field-or-update-field-values!
         mark-json-field!
         mark-no-preview-display-field!
         mark-url-field!
         maybe-driver-specific-sync-field!
         set-field-display-name-if-needed!
         sync-database-active-tables!
         sync-field!
         sync-table-active-fields-and-pks!
         sync-table-fks!
         sync-table-fields-metadata!
         update-table-display-name!
         sync-field-nested-fields!
         update-table-row-count!)

;; ## sync-database! and sync-table!

(defn sync-database!
  "Sync DATABASE and all its Tables and Fields."
  [driver database]
  (binding [qp/*disable-qp-logging* true
            *sel-disable-logging* true]
    (sync-in-context driver database
      (fn []
        (let [start-time (System/currentTimeMillis)]
          (log/info (u/format-color 'magenta "Syncing %s database '%s'..." (name (:engine database)) (:name database)))

          (let [active-table-names (active-table-names driver database)
                table-name->id     (sel :many :field->id [Table :name] :db_id (:id database) :active true)]
            (assert (set? active-table-names) "active-table-names should return a set.")
            (assert (every? string? active-table-names) "active-table-names should return the names of Tables as *strings*.")

            ;; First, let's mark any Tables that are no longer active as such.
            ;; These are ones that exist in table-name->id but not in active-table-names.
            (doseq [[table-name table-id] table-name->id]
              (when-not (contains? active-table-names table-name)
                (upd Table table-id :active false)
                (log/info (u/format-color 'cyan "Marked table %s.%s as inactive." (:name database) table-name))

                ;; We need to mark driver Table's Fields as inactive so we don't expose them in UI such as FK selector (etc.)
                (k/update Field
                          (k/where {:table_id table-id})
                          (k/set-fields {:active false}))))

            ;; Next, we'll create new Tables (ones that came back in active-table-names but *not* in table-name->id)
            (let [existing-table-names (set (keys table-name->id))
                  new-table-names      (set/difference active-table-names existing-table-names)]
              (when (seq new-table-names)
                (log/debug (u/format-color 'blue "Found new tables: %s" new-table-names))
                (doseq [new-table-name new-table-names]
                  (ins Table :db_id (:id database), :active true, :name new-table-name)))))

          ;; Now sync the active tables
          (->> (sel :many Table :db_id (:id database) :active true)
               (map #(assoc % :db (delay database))) ; replace default delays with ones that reuse database (and don't require a DB call)
               (sync-database-active-tables! driver))

          (log/info (u/format-color 'magenta "Finished syncing %s database %s. (%d ms)" (name (:engine database)) (:name database)
                                    (- (System/currentTimeMillis) start-time))))))))

(defn sync-table!
  "Sync a *single* TABLE by running all the sync steps for it.
   This is used *instead* of `sync-database!` when syncing just one Table is desirable."
  [driver table]
  (let [database @(:db table)]
    (binding [qp/*disable-qp-logging* true]
      (sync-in-context driver database
        (fn []
          (sync-database-active-tables! driver [table]))))))


;; ### sync-database-active-tables! -- runs the sync-table steps over sequence of Tables

(def ^:private sync-progress-meter-string
  "Create a string that shows sync progress for a database.

     (sync-progress-meter-string 10 40)
       -> \"[************······································] 25%\""
  (let [^:const meter-width    50
        ^:const progress-emoji ["😱"  ; face screaming in fear
                                "😢"  ; crying face
                                "😞"  ; disappointed face
                                "😒"  ; unamused face
                                "😕"  ; confused face
                                "😐"  ; neutral face
                                "😬"  ; grimacing face
                                "😌"  ; relieved face
                                "😏"  ; smirking face
                                "😋"  ; face savouring delicious food
                                "😊"  ; smiling face with smiling eyes
                                "😍"  ; smiling face with heart shaped eyes
                                "😎"] ; smiling face with sunglasses
        percent-done->emoji    (fn [percent-done]
                                 (progress-emoji (int (math/round (* percent-done (dec (count progress-emoji)))))))]
    (fn [tables-finished total-tables]
      (let [percent-done (float (/ tables-finished total-tables))
            filleds      (int (* percent-done meter-width))
            blanks       (- meter-width filleds)]
        (str "["
             (apply str (repeat filleds "*"))
             (apply str (repeat blanks "·"))
             (format "] %s  %3.0f%%" (percent-done->emoji percent-done) (* percent-done 100.0)))))))

(defn- sync-database-active-tables!
  "Sync active tables by running each of the sync table steps.
   Note that we want to completely finish each step for *all* tables before starting the next, since they depend on the results of the previous step.
   (e.g., `sync-table-fks!` can't run until all tables have finished `sync-table-active-fields-and-pks!`, since creating `ForeignKeys` to `Fields` of *other*
   Tables can't take place before they exist."
  [driver active-tables]
  (let [active-tables (sort-by :name active-tables)]
    ;; First, create all the Fields / PKs for all of the Tables
    (u/pdoseq [table active-tables]
      (u/try-apply sync-table-active-fields-and-pks! driver table))

    ;; After that, we can do all the other syncing for the Tables
    (let [tables-count          (count active-tables)
          finished-tables-count (atom 0)]
      (u/pdoseq [table active-tables]
        ;; make sure table has :display_name
        (u/try-apply update-table-display-name! table)

        ;; update the row counts for every Table
        (u/try-apply update-table-row-count! table)

        ;; Sync FKs for this Table
        (u/try-apply sync-table-fks! driver table)

        (sync-table-fields-metadata! driver table)
        (swap! finished-tables-count inc)
        (log/debug (u/format-color 'magenta "%s Synced table '%s'." (sync-progress-meter-string @finished-tables-count tables-count) (:name table)))))))


;; ## sync-table steps.

;; ### 0) update-table-display-name!

(defn- update-table-display-name!
  "Update the display_name of TABLE if it doesn't exist."
  [table]
  {:pre [(integer? (:id table))]}
  (try
    (when (nil? (:display_name table))
      (upd Table (:id table) :display_name (common/name->human-readable-name (:name table))))
    (catch Throwable e
      (log/error (u/format-color 'red "Unable to update display_name for %s: %s" (:name table) (.getMessage e))))))


;; ### 1) update-table-row-count!

(defn- update-table-row-count!
  "Update the row count of TABLE if it has changed."
  [table]
  {:pre [(integer? (:id table))]}
  (try
    (let [table-row-count (queries/table-row-count table)]
      (when-not (= (:rows table) table-row-count)
        (upd Table (:id table) :rows table-row-count)))
    (catch Throwable e
      (log/error (u/format-color 'red "Unable to update row_count for '%s': %s" (:name table) (.getMessage e))))))


;; ### 2) sync-table-active-fields-and-pks!

(defn- update-table-pks!
  "Mark primary-key `Fields` for TABLE as `special_type = id` if they don't already have a `special_type`."
  [table pk-fields]
  {:pre [(set? pk-fields)
         (every? string? pk-fields)]}
  (doseq [{field-name :name field-id :id} (sel :many :fields [Field :name :id], :table_id (:id table), :special_type nil, :name [in pk-fields], :parent_id nil)]
    (log/debug (u/format-color 'green "Field '%s.%s' is a primary key. Marking it as such." (:name table) field-name))
    (upd Field field-id :special_type :id)))

(defn- sync-table-active-fields-and-pks!
  "Create new Fields (and mark old ones as inactive) for TABLE, and update PK fields."
  [driver table]
  (let [database @(:db table)]
    ;; Now do the syncing for Table's Fields
    (let [active-column-names->type  (active-column-names->type driver table)
          existing-field-name->field (sel :many :field->fields [Field :name :base_type :id], :table_id (:id table), :active true, :parent_id nil)]

      (assert (map? active-column-names->type) "active-column-names->type should return a map.")
      (assert (every? string? (keys active-column-names->type)) "The keys of active-column-names->type should be strings.")
      (assert (every? (partial contains? field/base-types) (vals active-column-names->type)) "The vals of active-column-names->type should be valid Field base types.")

      ;; As above, first mark inactive Fields
      (let [active-column-names (set (keys active-column-names->type))]
        (doseq [[field-name {field-id :id}] existing-field-name->field]
          (when-not (contains? active-column-names field-name)
            (upd Field field-id :active false)
            (log/info (u/format-color 'cyan "Marked field '%s.%s' as inactive." (:name table) field-name)))))

      ;; Create new Fields, update existing types if needed
      (let [existing-field-names (set (keys existing-field-name->field))
            new-field-names      (set/difference (set (keys active-column-names->type)) existing-field-names)]
        (when (seq new-field-names)
          (log/debug (u/format-color 'blue "Found new fields for table '%s': %s" (:name table) new-field-names)))
        (doseq [[active-field-name active-field-type] active-column-names->type]
          ;; If Field doesn't exist create it
          (if-not (contains? existing-field-names active-field-name)
            (ins Field
              :table_id  (:id table)
              :name      active-field-name
              :base_type active-field-type)
            ;; Otherwise update the Field type if needed
            (let [{existing-base-type :base_type, existing-field-id :id} (existing-field-name->field active-field-name)]
              (when-not (= active-field-type existing-base-type)
                (log/debug (u/format-color 'blue "Field '%s.%s' has changed from a %s to a %s." (:name table) active-field-name existing-base-type active-field-type))
                (upd Field existing-field-id :base_type active-field-type))))))
      ;; TODO - we need to add functionality to update nested Field base types as well!

      ;; Now mark PK fields as such if needed
      (let [pk-fields (table-pks driver table)]
        (u/try-apply update-table-pks! table pk-fields)))))


;; ### 3) sync-table-fks!

(defn- determine-fk-type
  "Determine whether a FK is `:1t1`, or `:Mt1`.
   Do this by getting the count and distinct counts of source `Field`.

   *  If count and distinct count are equal, we have a one-to-one foreign key relationship.
   *  If count is > distinct count, we have a many-to-one foreign key relationship."
  [field]
  (let [field-count          (queries/field-count field)
        field-distinct-count (queries/field-distinct-count field)]
    (if (= field-count field-distinct-count) :1t1
        :Mt1)))

(defn- sync-table-fks! [driver table]
  (when (extends? ISyncDriverTableFKs (type driver))
    (let [fks (table-fks driver table)]
      (assert (and (set? fks)
                   (every? map? fks)
                   (every? :fk-column-name fks)
                   (every? :dest-table-name fks)
                   (every? :dest-column-name fks))
              "table-fks should return a set of maps with keys :fk-column-name, :dest-table-name, and :dest-column-name.")
      (when (seq fks)
        (let [fk-name->id    (sel :many :field->id [Field :name], :table_id (:id table), :special_type nil, :name [in (map :fk-column-name fks)], :parent_id nil)
              table-name->id (sel :many :field->id [Table :name], :name [in (map :dest-table-name fks)])]
          (doseq [{:keys [fk-column-name dest-column-name dest-table-name] :as fk} fks]
            (when-let [fk-column-id (fk-name->id fk-column-name)]
              (when-let [dest-table-id (table-name->id dest-table-name)]
                (when-let [dest-column-id (sel :one :id Field, :table_id dest-table-id, :name dest-column-name, :parent_id nil)]
                  (log/debug (u/format-color 'green "Marking foreign key '%s.%s' -> '%s.%s'." (:name table) fk-column-name dest-table-name dest-column-name))
                  (ins ForeignKey
                    :origin_id      fk-column-id
                    :destination_id dest-column-id
                    :relationship   (determine-fk-type {:id fk-column-id, :table (delay table)})) ; fake a Field instance
                  (upd Field fk-column-id :special_type :fk))))))))))


;; ### 4) sync-table-fields-metadata!

(defn- sync-table-fields-metadata!
  "Call `sync-field!` for every active Field for TABLE."
  [driver table]
  {:pre [(map? table)]}
  (let [active-fields (sel :many Field, :table_id (:id table), :active true, :parent_id nil, (k/order :name))]
    (doseq [field active-fields]
      ;; replace the normal delay for the Field with one that just returns the existing Table so we don't need to re-fetch
      (u/try-apply sync-field! driver (assoc field :table (delay table))))))


;; ## sync-field

(defmacro ^:private sync-field->>
  "Like `->>`, but wrap each form with `try-apply`, and pass FIELD along to the next if the previous form returned `nil`."
  [field & fns]
  `(->> ~field
        ~@(->> fns
               (map (fn [f]
                      (let [[f & args] (if (list? f) f [f])]
                        `((fn [field#]
                             (or (u/try-apply ~f ~@args field#)
                                 field#)))))))))

(defn- sync-field!
  "Sync the metadata for FIELD, marking urls, categories, etc. when applicable."
  [driver field]
  {:pre [driver
         field]}
  (sync-field->> field
                 (maybe-driver-specific-sync-field! driver)
                 set-field-display-name-if-needed!
                 (mark-url-field! driver)
                 (mark-no-preview-display-field! driver)
                 mark-category-field-or-update-field-values!
                 (mark-json-field! driver)
                 auto-assign-field-special-type-by-name!
                 (sync-field-nested-fields! driver)))


;; Each field-syncing function below should return FIELD with any updates that we made, or nil.
;; That way the next fn in the 'pipeline' won't trample over changes made by the last.

;;; ### maybe-driver-specific-sync-field!

(defn- maybe-driver-specific-sync-field!
  "If driver implements `ISyncDriverSpecificSyncField`, call `driver-specific-sync-field!`."
  [driver field]
  (when (satisfies? ISyncDriverSpecificSyncField driver)
    (driver-specific-sync-field! driver field)))

;; ### set-field-display-name-if-needed!

(defn- set-field-display-name-if-needed!
  "If FIELD doesn't yet have a `display_name`, calculate one now and set it."
  [field]
  (when (nil? (:display_name field))
    (let [display-name (common/name->human-readable-name (:name field))]
      (log/debug (u/format-color 'green "Field '%s.%s' has no display_name. Setting it now." (:name @(:table field)) (:name field) display-name))
      (upd Field (:id field) :display_name display-name)
      (assoc field :display_name display-name))))


;; ### mark-url-field!

(def ^:const ^:private percent-valid-url-threshold
  "Fields that have at least this percent of values that are valid URLs should be marked as `special_type = :url`."
  0.95)

(defn- percent-valid-urls
  "Recursively count the values of non-nil values in VS that are valid URLs, and return it as a percentage."
  [vs]
  (loop [valid-count 0, non-nil-count 0, [v & more :as vs] vs]
    (cond (not (seq vs)) (if (zero? non-nil-count) 0.0
                             (float (/ valid-count non-nil-count)))
          (nil? v)       (recur valid-count non-nil-count more)
          :else          (let [valid? (and (string? v)
                                           (u/is-url? v))]
                           (recur (if valid? (inc valid-count) valid-count)
                                  (inc non-nil-count)
                                  more)))))

(extend-protocol ISyncDriverFieldPercentUrls ; Default implementation
  Object
  (field-percent-urls [this field]
    (let [field-values (->> (field-values-lazy-seq this field)
                            (filter identity)
                            (take max-sync-lazy-seq-results))]
      (percent-valid-urls field-values))))

(defn- mark-url-field!
  "If FIELD is texual, doesn't have a `special_type`, and its non-nil values are primarily URLs, mark it as `special_type` `url`."
  [driver field]
  (when (and (not (:special_type field))
             (contains? #{:CharField :TextField} (:base_type field)))
    (when-let [percent-urls (field-percent-urls driver field)]
      (assert (float? percent-urls))
      (assert (>= percent-urls 0.0))
      (assert (<= percent-urls 100.0))
      (when (> percent-urls percent-valid-url-threshold)
        (log/debug (u/format-color 'green "Field '%s' is %d%% URLs. Marking it as a URL." @(:qualified-name field) (int (math/round (* 100 percent-urls)))))
        (upd Field (:id field) :special_type :url)
        (assoc field :special_type :url)))))


;; ### mark-category-field-or-update-field-values!

(def ^:const ^:private low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be marked with `special_type = :category`."
  40)

(defn- mark-category-field!
  "If FIELD doesn't yet have a `special_type`, and has low cardinality, mark it as a category."
  [field]
  (let [cardinality (queries/field-distinct-count field low-cardinality-threshold)]
    (when (and (> cardinality 0)
               (< cardinality low-cardinality-threshold))
      (log/debug (u/format-color 'green "Field '%s' has %d unique values. Marking it as a category." @(:qualified-name field) cardinality))
      (upd Field (:id field) :special_type :category)
      (assoc field :special_type :category))))

(defn- mark-category-field-or-update-field-values!
  "If FIELD doesn't yet have a `special_type` and isn't very long (i.e., `preview_display` is `true`), call `mark-category-field!`
   to (possibly) mark it as a `:category`. Otherwise if FIELD is already a `:category` update its `FieldValues`."
  [field]
  (cond
    (and (not (:special_type field))
         (:preview_display field))                       (mark-category-field! field)
    (field-values/field-should-have-field-values? field) (do (field-values/update-field-values! field)
                                                             field)))


;; ### mark-no-preview-display-field!

(def ^:const ^:private average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)

(extend-protocol ISyncDriverFieldAvgLength ; Default implementation
  Object
  (field-avg-length [this field]
    (let [field-values (->> (field-values-lazy-seq this field)
                            (filter identity)
                            (take max-sync-lazy-seq-results)) ; as with field-percent-urls it's probably fine to consider the first 10,000 values rather than potentially millions
          field-values-count (count field-values)]
      (if (= field-values-count 0) 0
          (int (math/round (/ (->> field-values
                                   (map str)
                                   (map count)
                                   (reduce +))
                              field-values-count)))))))

(defn- mark-no-preview-display-field!
  "If FIELD's is textual and its average length is too great, mark it so it isn't displayed in the UI."
  [driver field]
  (when (and (:preview_display field)
             (contains? #{:CharField :TextField} (:base_type field)))
    (let [avg-len (field-avg-length driver field)]
      (assert (integer? avg-len) "field-avg-length should return an integer.")
      (when (> avg-len average-length-no-preview-threshold)
        (log/debug (u/format-color 'green "Field '%s' has an average length of %d. Not displaying it in previews." @(:qualified-name field) avg-len))
        (upd Field (:id field) :preview_display false)
        (assoc field :preview_display false)))))


;; ### mark-json-field!

(defn- values-are-valid-json?
  "`true` if at every item in VALUES is `nil` or a valid string-encoded JSON dictionary or array, and at least one of those is non-nil."
  [values]
  (try
    (loop [at-least-one-non-nil-value? false, [val & more] values]
      (cond
        (and (not val)
             (not (seq more))) at-least-one-non-nil-value?
        (s/blank? val)         (recur at-least-one-non-nil-value? more)
        ;; If val is non-nil, check that it's a JSON dictionary or array. We don't want to mark Fields containing other
        ;; types of valid JSON values as :json (e.g. a string representation of a number or boolean)
        :else                  (let [val (json/parse-string val)]
                                 (when (not (or (map? val)
                                                (sequential? val)))
                                   (throw (Exception.)))
                                 (recur true more))))
    (catch Throwable _
      false)))

(defn- mark-json-field!
  "Mark FIELD as `:json` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid serialized JSON dictionaries or arrays."
  [driver field]
  (when (and (not (:special_type field))
             (contains? #{:CharField :TextField} (:base_type field))
             (values-are-valid-json? (->> (field-values-lazy-seq driver field)
                                          (take max-sync-lazy-seq-results))))
    (log/debug (u/format-color 'green "Field '%s' looks like it contains valid JSON objects. Setting special_type to :json." @(:qualified-name field)))
    (upd Field (:id field) :special_type :json, :preview_display false)
    (assoc field :special_type :json, :preview_display false)))


;; ### auto-assign-field-special-type-by-name!

(def ^:private ^{:arglists '([field])}
  field->name-inferred-special-type
  "If FIELD has a `name` and `base_type` that matches a known pattern, return the `special_type` we should assign to it."
  (let [bool-or-int #{:BooleanField :BigIntegerField :IntegerField}
        float       #{:DecimalField :FloatField}
        int-or-text #{:BigIntegerField :IntegerField :CharField :TextField}
        text        #{:CharField :TextField}
        ;; tuples of [pattern set-of-valid-base-types special-type [& top-level-only?]
        ;; * Convert field name to lowercase before matching against a pattern
        ;; * consider a nil set-of-valid-base-types to mean "match any base type"
        pattern+base-types+special-type+top-level-only? [[#"^.*_lat$"       float       :latitude]
                                                         [#"^.*_lon$"       float       :longitude]
                                                         [#"^.*_lng$"       float       :longitude]
                                                         [#"^.*_long$"      float       :longitude]
                                                         [#"^.*_longitude$" float       :longitude]
                                                         [#"^.*_rating$"    int-or-text :category]
                                                         [#"^.*_type$"      int-or-text :category]
                                                         [#"^.*_url$"       text        :url]
                                                         [#"^_latitude$"    float       :latitude]
                                                         [#"^active$"       bool-or-int :category]
                                                         [#"^city$"         text        :city]
                                                         [#"^country$"      text        :country]
                                                         [#"^countrycode$"  text        :country]
                                                         [#"^currency$"     int-or-text :category]
                                                         [#"^first_name$"   text        :name]
                                                         [#"^full_name$"    text        :name]
                                                         [#"^gender$"       int-or-text :category]
                                                         [#"^id$"           nil         :id         :top-level-only]
                                                         [#"^last_name$"    text        :name]
                                                         [#"^lat$"          float       :latitude]
                                                         [#"^latitude$"     float       :latitude]
                                                         [#"^lon$"          float       :longitude]
                                                         [#"^lng$"          float       :longitude]
                                                         [#"^long$"         float       :longitude]
                                                         [#"^longitude$"    float       :longitude]
                                                         [#"^name$"         text        :name]
                                                         [#"^postalCode$"   int-or-text :zip_code]
                                                         [#"^postal_code$"  int-or-text :zip_code]
                                                         [#"^rating$"       int-or-text :category]
                                                         [#"^role$"         int-or-text :category]
                                                         [#"^sex$"          int-or-text :category]
                                                         [#"^state$"        text        :state]
                                                         [#"^status$"       int-or-text :category]
                                                         [#"^type$"         int-or-text :category]
                                                         [#"^url$"          text        :url]
                                                         [#"^zip_code$"     int-or-text :zip_code]
                                                         [#"^zipcode$"      int-or-text :zip_code]]]
    ;; Check that all the pattern tuples are valid
    (doseq [[name-pattern base-types special-type] pattern+base-types+special-type+top-level-only?]
      (assert (= (type name-pattern) java.util.regex.Pattern))
      (assert (every? (partial contains? field/base-types) base-types))
      (assert (contains? field/special-types special-type)))

    (fn [{base-type :base_type, field-name :name, :as field}]
      {:pre [(string? field-name)
             (keyword? base-type)]}
      (or (m/find-first (fn [[name-pattern valid-base-types _ top-level-only?]]
                          (and (or (nil? valid-base-types)
                                   (contains? valid-base-types base-type))
                               (re-matches name-pattern (s/lower-case field-name))
                               (or (not top-level-only?)
                                   (nil? (:parent_id field)))))
                        pattern+base-types+special-type+top-level-only?)))))

(defn- auto-assign-field-special-type-by-name!
  "If FIELD doesn't have a special type, but has a name that matches a known pattern like `latitude`, mark it as having the specified special type."
  [field]
  (when-not (:special_type field)
    (when-let [[pattern _ special-type] (field->name-inferred-special-type field)]
      (log/debug (u/format-color 'green "%s '%s' matches '%s'. Setting special_type to '%s'."
                                (name (:base_type field)) @(:qualified-name field) pattern (name special-type)))
      (upd Field (:id field) :special_type special-type)
      (assoc field :special_type special-type))))


(defn- sync-field-nested-fields! [driver field]
  (when (and (= (:base_type field) :DictionaryField)
             (supports? driver :nested-fields)                 ; if one of these is true
             (satisfies? ISyncDriverFieldNestedFields driver)) ; the other should be :wink:
    (let [nested-field-name->type (active-nested-field-name->type driver field)]
      ;; fetch existing nested fields
      (let [existing-nested-field-name->id (sel :many :field->id [Field :name], :table_id (:table_id field), :active true, :parent_id (:id field))]

        ;; mark existing nested fields as inactive if they didn't come back from active-nested-field-name->type
        (doseq [[nested-field-name nested-field-id] existing-nested-field-name->id]
          (when-not (contains? (set (map keyword (keys nested-field-name->type))) (keyword nested-field-name))
            (log/info (u/format-color 'cyan "Marked nested field '%s.%s' as inactive." @(:qualified-name field) nested-field-name))
            (upd Field nested-field-id :active false)))

        ;; OK, now create new Field objects for ones that came back from active-nested-field-name->type but *aren't* in existing-nested-field-name->id
        (doseq [[nested-field-name nested-field-type] nested-field-name->type]
          (when-not (contains? (set (map keyword (keys existing-nested-field-name->id))) (keyword nested-field-name))
            (log/debug (u/format-color 'blue "Found new nested field: '%s.%s'" @(:qualified-name field) (name nested-field-name)))
            (let [nested-field (ins Field, :table_id (:table_id field), :parent_id (:id field), :name (name nested-field-name) :base_type (name nested-field-type), :active true)]
              ;; Now recursively sync this nested Field
              ;; Replace parent so deref doesn't need to do a DB call
              (sync-field! driver (assoc nested-field :parent (delay field))))))))))
