(ns metabase.driver.sync
  "The logic for doing DB and Table syncing itself."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [korma.core :as k]
            [metabase.db :refer :all]
            (metabase.driver [interface :refer :all]
                             [query-processor :as qp])
            [metabase.driver.sync.queries :as queries]
            (metabase.models [field :refer [Field] :as field]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.util :as u]))

(declare mark-category-field!
         mark-no-preview-display-field!
         mark-url-field!
         sync-database-active-tables!
         sync-field!
         sync-table-active-fields-and-pks!
         sync-table-fks!
         sync-table-fields-metadata!
         update-table-row-count!)

;; ## sync-database! and sync-table!

(defn sync-database!
  "Sync DATABASE and all its Tables and Fields."
  [driver database]
  (binding [qp/*disable-qp-logging* true]
    (sync-in-context driver database
      (fn []
        (log/info (color/blue (format "Syncing database %s..." (:name database))))

        (let [active-table-names (active-table-names driver database)
              table-name->id (sel :many :field->id [Table :name] :db_id (:id database) :active true)]
          (assert (set? active-table-names) "active-table-names should return a set.")
          (assert (every? string? active-table-names) "active-table-names should return the names of Tables as *strings*.")

          ;; First, let's mark any Tables that are no longer active as such.
          ;; These are ones that exist in table-name->id but not in active-table-names.
          (log/debug "Marking inactive tables...")
          (doseq [[table-name table-id] table-name->id]
            (when-not (contains? active-table-names table-name)
              (upd Table table-id :active false)
              (log/info (format "Marked table %s.%s as inactive." (:name database) table-name))

              ;; We need to mark driver Table's Fields as inactive so we don't expose them in UI such as FK selector (etc.) This can happen in the background
              (future (k/update Field
                                (k/where {:table_id table-id})
                                (k/set-fields {:active false})))))

          ;; Next, we'll create new Tables (ones that came back in active-table-names but *not* in table-name->id)
          (log/debug "Creating new tables...")
          (let [existing-table-names (set (keys table-name->id))]
            (doseq [active-table-name active-table-names]
              (when-not (contains? existing-table-names active-table-name)
                (ins Table :db_id (:id database), :active true, :name active-table-name)
                (log/info (format "Found new table: %s.%s" (:name database) active-table-name))))))

        ;; Now sync the active tables
        (log/debug "Syncing active tables...")
        (->> (sel :many Table :db_id (:id database) :active true)
             (map #(assoc % :db (delay database))) ; replace default delays with ones that reuse database (and don't require a DB call)
             (sync-database-active-tables! driver))

        (log/info (color/blue (format "Finished syncing database %s." (:name database))))))))

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

(defn sync-database-active-tables!
  "Sync active tables by running each of the sync table steps.
   Note that we want to completely finish each step for *all* tables before starting the next, since they depend on the results of the previous step.
   (e.g., `sync-table-fks!` can't run until all tables have finished `sync-table-active-fields-and-pks!`, since creating `ForeignKeys` to `Fields` of *other*
   Tables can't take place before they exist."
  [driver active-tables]
  ;; update the row counts for every Table. These *can* happen asynchronously, but since they make a lot of DB calls each so
  ;; going to block while they run for the time being. (TODO - fix this)
  (log/debug (color/green "Updating table row counts..."))
  (doseq [table active-tables]
    (u/try-apply update-table-row-count! table))

  ;; Next, create new Fields / mark inactive Fields / mark PKs for each table
  ;; (TODO - this was originally done in parallel but it was only marginally faster, and harder to debug. Should we switch back at some point?)
  (log/debug (color/green "Syncing active Fields + PKs..."))
  (doseq [table active-tables]
    (u/try-apply sync-table-active-fields-and-pks! driver table))

  ;; Once that's finished, we can sync FKs
  (log/debug (color/green "Syncing FKs..."))
  (doseq [table active-tables]
    (u/try-apply sync-table-fks! driver table))

  ;; After that, we can sync the metadata for all active Fields
  ;; Now sync all active fields
  (let [tables-count (count active-tables)
        finished-tables-count (atom 0)]
    (doseq [table active-tables]
      (log/debug (color/green (format "Syncing metadata for %s.%s..." (:name @(:db table)) (:name table))))
      (sync-table-fields-metadata! driver table)
      (swap! finished-tables-count inc)
      (log/info (color/blue (format "Synced %s.%s (%d/%d)" (:name @(:db table)) (:name table) @finished-tables-count tables-count))))))


;; ## sync-table steps.

;; ### 1) update-table-row-count!

(defn update-table-row-count!
  "Update the row count of TABLE if it has changed."
  [table]
  {:pre [(integer? (:id table))]}
  (let [table-row-count (queries/table-row-count table)]
    (when-not (= (:rows table) table-row-count)
      (upd Table (:id table) :rows table-row-count))))


;; ### 2) sync-table-active-fields-and-pks!

(defn update-table-pks!
  "Mark primary-key `Fields` for TABLE as `special_type = id` if they don't already have a `special_type`."
  [table pk-fields]
  {:pre [(set? pk-fields)
         (every? string? pk-fields)]}
  (doseq [{field-name :name field-id :id} (sel :many :fields [Field :name :id] :table_id (:id table) :special_type nil :name [in pk-fields])]
    (log/info (format "Field '%s.%s' is a primary key. Marking it as such." (:name table) field-name))
    (upd Field field-id :special_type :id)))

(defn sync-table-active-fields-and-pks!
  "Create new Fields (and mark old ones as inactive) for TABLE, and update PK fields."
  [driver table]
  (let [database @(:db table)]
    ;; Now do the syncing for Table's Fields
    (let [active-column-names->type (active-column-names->type driver table)
          field-name->id (sel :many :field->id [Field :name] :table_id (:id table) :active true)]
      (assert (map? active-column-names->type) "active-column-names->type should return a map.")
      (assert (every? string? (keys active-column-names->type)) "The keys of active-column-names->type should be strings.")
      (assert (every? (partial contains? field/base-types) (vals active-column-names->type)) "The vals of active-column-names->type should be valid Field base types.")

      ;; As above, first mark inactive Fields
      (let [active-column-names (set (keys active-column-names->type))]
        (doseq [[field-name field-id] field-name->id]
          (when-not (contains? active-column-names field-name)
            (upd Field field-id :active false)
            (log/info (format "Marked field %s.%s.%s as inactive." (:name database) (:name table) field-name)))))

      ;; Next, create new Fields as needed
      (let [existing-field-names (set (keys field-name->id))]
        (doseq [[active-field-name active-field-type] active-column-names->type]
          (when-not (contains? existing-field-names active-field-name)
            (ins Field
              :table_id (:id table)
              :name active-field-name
              :base_type active-field-type))))

      ;; Now mark PK fields as such if needed
      (let [pk-fields (table-pks driver table)]
        (u/try-apply update-table-pks! table pk-fields)))))


;; ### 3) sync-table-fks!

(defn determine-fk-type
  "Determine whether a FK is `:1t1`, or `:Mt1`.
   Do this by getting the count and distinct counts of source `Field`.

   *  If count and distinct count are equal, we have a one-to-one foreign key relationship.
   *  If count is > distinct count, we have a many-to-one foreign key relationship."
  [field]
  (let [field-count          (queries/field-count field)
        field-distinct-count (queries/field-distinct-count field)]
    (if (= field-count field-distinct-count) :1t1
        :Mt1)))

(defn sync-table-fks! [driver table]
  (when (extends? ISyncDriverTableFKs (type driver))
    (let [fks (table-fks driver table)]
      (assert (and (set? fks)
                   (every? map? fks)
                   (every? :fk-column-name fks)
                   (every? :dest-table-name fks)
                   (every? :dest-column-name fks))
              "table-fks should return a set of maps with keys :fk-column-name, :dest-table-name, and :dest-column-name.")
      (when (seq fks)
        (let [fk-name->id    (sel :many :field->id [Field :name] :table_id (:id table), :special_type nil, :name [in (map :fk-column-name fks)])
              table-name->id (sel :many :field->id [Table :name] :name [in (map :dest-table-name fks)])]
          (doseq [{:keys [fk-column-name dest-column-name dest-table-name] :as fk} fks]
            (when-let [fk-column-id (fk-name->id fk-column-name)]
              (when-let [dest-table-id (table-name->id dest-table-name)]
                (when-let [dest-column-id (sel :one :id Field :table_id dest-table-id :name dest-column-name)]
                  (log/info (format "Marking foreign key '%s.%s' -> '%s.%s'." (:name table) fk-column-name dest-table-name dest-column-name))
                  (ins ForeignKey
                    :origin_id fk-column-id
                    :destination_id dest-column-id
                    :relationship (determine-fk-type {:id fk-column-id, :table (delay table)})) ; fake a Field instance
                  (upd Field fk-column-id :special_type :fk))))))))))


;; ### 4) sync-table-fields-metadata!

(defn sync-table-fields-metadata!
  "Call `sync-field!` for every active Field for TABLE."
  [driver table]
  (let [active-fields (->> (sel :many Field, :table_id (:id table), :active true)
                           (map #(assoc % :table (delay table))))] ; as above, replace the delay that comes back with one that reuses existing table obj
    (doseq [field active-fields]
      (u/try-apply sync-field! driver field))))


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

(defn sync-field!
  "Sync the metadata for FIELD, marking urls, categories, etc. when applicable."
  [driver field]
  {:pre [driver
         field]}
  (sync-field->> field
                 (mark-url-field! driver)
                 mark-category-field!
                 (mark-no-preview-display-field! driver)))


;; Each field-syncing function below should return FIELD with any updates that we made, or nil.
;; That way the next fn in the 'pipeline' won't trample over changes made by the last.

;; ### mark-url-field!

(def ^:const ^:private percent-valid-url-threshold
  "Fields that have at least this percent of values that are valid URLs should be marked as `special_type = :url`."
  0.95)

(defn percent-valid-urls
  "Recursively count the values of non-nil values in VS that are valid URLs, and return it as a percentage."
  [vs]
  (loop [valid-count 0 non-nil-count 0 [v & more :as vs] vs]
    (cond (not (seq vs)) (float (/ valid-count non-nil-count))
          (nil? v)       (recur valid-count non-nil-count more)
          :else          (let [valid? (and (string? v)
                                           (u/is-url? v))]
                           (recur (if valid? (inc valid-count) valid-count)
                                  (inc non-nil-count)
                                  more)))))

(extend-protocol ISyncDriverFieldPercentUrls ; Default implementation
  Object
  (field-percent-urls [this field]
    (assert (extends? ISyncDriverFieldValues (class this))
            "A sync driver implementation that doesn't implement ISyncDriverFieldPercentURLs must implement ISyncDriverFieldValues.")
    (let [field-values (field-values-lazy-seq this field)]
      (percent-valid-urls field-values))))

(defn mark-url-field!
  "If FIELD is texual, doesn't have a `special_type`, and its non-nil values are primarily URLs, mark it as `special_type` `url`."
  [driver field]
  (when (and (not (:special_type field))
             (contains? #{:CharField :TextField} (:base_type field)))
    (let [percent-urls (field-percent-urls driver field)]
      (assert (float? percent-urls))
      (assert (>= percent-urls 0.0))
      (assert (<= percent-urls 100.0))
      (when (> percent-urls percent-valid-url-threshold)
        (log/info (format "Field '%s.%s' is %d%% URLs. Marking it as a URL." (:name @(:table field)) (:name field) (int (math/round (* 100 percent-urls)))))
        (upd Field (:id field) :special_type :url)
        (assoc field :special_type :url)))))


;; ### mark-category-field!

(def ^:const ^:private low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be marked with `special_type = :category`."
  40)

(defn mark-category-field!
  "If FIELD doesn't yet have a `special_type`, and has low cardinality, mark it as a category."
  [field]
  (when-not (:special_type field)
    (let [cardinality (queries/field-distinct-count field low-cardinality-threshold)]
      (when (and (> cardinality 0)
                 (< cardinality low-cardinality-threshold))
        (log/info (format "Field '%s.%s' has %d unique values. Marking it as a category." (:name @(:table field)) (:name field) cardinality))
        (upd Field (:id field) :special_type :category)
        (assoc field :special_type :category)))))


;; ### mark-no-preview-display-field!

(def ^:const ^:private average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)

(extend-protocol ISyncDriverFieldAvgLength ; Default implementation
  Object
  (field-avg-length [this field]
    (assert (extends? ISyncDriverFieldValues (class this))
            "A sync driver implementation that doesn't implement ISyncDriverFieldAvgLength must implement ISyncDriverFieldValues.")
    (let [field-values (field-values-lazy-seq this field)
          field-values-count (count field-values)]
      (if (= field-values-count 0) 0
          (int (math/round (/ (->> field-values
                                   (map count)
                                   (reduce +))
                              field-values-count)))))))

(defn mark-no-preview-display-field!
  "If FIELD's is textual and its average length is too great, mark it so it isn't displayed in the UI."
  [driver field]
  (when (and (:preview_display field)
             (contains? #{:CharField :TextField} (:base_type field)))
    (let [avg-len (field-avg-length driver field)]
      (assert (integer? avg-len) "field-avg-length should return an integer.")
      (when (> avg-len average-length-no-preview-threshold)
        (log/info (format "Field '%s.%s' has an average length of %d. Not displaying it in previews." (:name @(:table field)) (:name field) avg-len))
        (upd Field (:id field) :preview_display false)
        (assoc field :preview_display false)))))
