(ns dev.db-schema
  (:require
   [clojure.data.json :as json]
   [clojure.string :as str]
   [toucan2.core :as t2])
  (:import
   (org.postgresql.jdbc PgArray)))

(set! *warn-on-reflection* true)

;; Default values that can be omitted from compact representation
(def column-defaults
  {:is_nullable              false
   :column_default           nil
   :character_maximum_length nil
   :numeric_precision        nil
   :numeric_scale            nil
   :datetime_precision       6})

(def index-defaults
  {:is_unique  false
   :is_primary false})

;; Type mappings from PostgreSQL to generic types
(def type-mappings
  {"integer"                     "int"
   "character varying"           "varchar"
   "boolean"                     "bool"
   "timestamp without time zone" "timestamp"
   "timestamp with time zone"    "timestamptz"
   "double precision"            "double"})

;; Common defaults for specific types
(def type-defaults
  {"varchar" {:character_maximum_length 254}
   "int"     {:numeric_precision 32 :numeric_scale 0}})

;; Standard ID column definition
(def id-column-defaults
  {:column_name              "id"
   :type                     "int"
   :is_nullable              false
   :column_default           nil
   :character_maximum_length nil
   :numeric_precision        32
   :numeric_scale            0
   :datetime_precision       nil})

;; Pseudo type definitions
(def entity-id-defaults
  {:type                     "varchar"
   :character_maximum_length 21
   :is_nullable              true
   :datetime_precision       6})

(def auto-timestamp-defaults
  {:type                     "timestamptz"
   :column_default           "now()"
   :character_maximum_length nil
   :numeric_precision        nil
   :numeric_scale            nil
   :is_nullable              false
   :datetime_precision       6})

(def pk-defaults
  {:type                     "int"
   :is_nullable              false
   :column_default           nil
   :character_maximum_length nil
   :numeric_precision        32
   :numeric_scale            0
   :datetime_precision       6})

(def fk-defaults
  {:type                     "int"
   :is_nullable              false
   :column_default           nil
   :character_maximum_length nil
   :numeric_precision        32
   :numeric_scale            0
   :datetime_precision       nil})

(defn get-table-columns [table-name]
  (t2/query
   ["SELECT
       column_name,
       data_type,
       is_nullable,
       column_default,
       character_maximum_length,
       numeric_precision,
       numeric_scale,
       datetime_precision,
       udt_name
     FROM information_schema.columns
     WHERE table_name = ?
     ORDER BY ordinal_position"
    table-name]))

(defn get-table-indexes [table-name]
  (t2/query
   ["SELECT
       i.relname as index_name,
       array_agg(
         CASE WHEN ix.indoption[c.ordinality-1] & 1 = 1
         THEN json_build_array(a.attname, 'desc')::text
         ELSE a.attname
         END
         ORDER BY c.ordinality
       ) as columns,
       ix.indisunique as is_unique,
       ix.indisprimary as is_primary
     FROM pg_class t
     JOIN pg_index ix ON t.oid = ix.indrelid
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN unnest(ix.indkey) WITH ORDINALITY AS c(attnum, ordinality) ON true
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.attnum
     WHERE t.relname = ?
     GROUP BY i.relname, ix.indisunique, ix.indisprimary, ix.indoption
     ORDER BY i.relname"
    table-name]))

(defn get-tables [table-filter]
  (let [base-query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        query      (cond
                     (str/includes? table-filter ",")
                     (let [table-list   (map str/trim (str/split table-filter #","))
                           placeholders (str/join "," (repeat (count table-list) "?"))]
                       (into [(str base-query " AND table_name IN (" placeholders ")")]
                             table-list))

                     (str/ends-with? table-filter "%")
                     [(str base-query " AND table_name LIKE ?")
                      table-filter]

                     :else
                     [(str base-query " AND table_name = ?")
                      table-filter])]
    (->> (t2/query query)
         (map :table_name))))

(defn remove-defaults [m defaults]
  (reduce-kv (fn [acc k v]
               (if (or (= v (get defaults k)) (nil? v))
                 acc
                 (assoc acc k v)))
             {}
             m))

(defn expand-defaults [m defaults]
  (merge defaults m))

(defn get-foreign-keys [table-name]
  (t2/query
   ["SELECT
       kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
     FROM information_schema.table_constraints AS tc
     JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_name = ?"
    table-name]))

(defn- sort-column-keys [column]
  (merge (select-keys column [:column_name :type])
         (into (sorted-map) (dissoc column :column_name :type))))

(defn compact-type [col]
  (let [type (:type col)]
    (cond
      (and (= type "varchar") (:character_maximum_length col))
      (str type "(" (:character_maximum_length col) ")")

      (and (= type "int") (:numeric_precision col) (not= (:numeric_precision col) 32))
      (str type "(" (:numeric_precision col) ")")

      :else type)))

(defn normalize-column [col]
  (let [generic-type    (get type-mappings (:data_type col) (:data_type col))
        base-normalized (-> col
                            (select-keys [:column_name :data_type :is_nullable :column_default
                                          :character_maximum_length :numeric_precision :numeric_scale
                                          :datetime_precision :udt_name])
                            (update :is_nullable #(= "YES" %))
                            (update :column_default #(when % (str %)))
                            (assoc :type generic-type)
                            (dissoc :data_type :udt_name))]
    (cond
      (and (= "id" (:column_name base-normalized))
           (= base-normalized (merge id-column-defaults {:column_name "id"})))
      :id

      (and (= "entity_id" (:column_name base-normalized))
           (= base-normalized (merge entity-id-defaults {:column_name (:column_name base-normalized)})))
      {:column_name (:column_name base-normalized), :type "entity_id"}

      ;; Foreign key
      (and (str/ends-with? (:column_name base-normalized) "_id")
           (= base-normalized (merge fk-defaults {:column_name (:column_name base-normalized)})))
      {:column_name (:column_name base-normalized), :type "fk"}

      (and (= "created_at" (:column_name base-normalized))
           (= base-normalized (merge auto-timestamp-defaults {:column_name "created_at"})))
      :created_at

      (and (= "updated_at" (:column_name base-normalized))
           (= base-normalized (merge auto-timestamp-defaults {:column_name "updated_at"})))
      :updated_at

      ;; Remove type-specific defaults if they match exactly
      :else
      (let [type-defaults-for-type  (get type-defaults generic-type {})
            without-common-defaults (remove-defaults base-normalized column-defaults)
            without-type-defaults   (if (and (seq type-defaults-for-type)
                                             (every? (fn [[k v]] (= (get without-common-defaults k) v)) type-defaults-for-type))
                                      (remove-defaults without-common-defaults type-defaults-for-type)
                                      without-common-defaults)
            ;; Compact the type with its parameters
            compacted               (-> without-type-defaults
                                        (assoc :type (compact-type without-type-defaults))
                                        (dissoc :character_maximum_length :numeric_precision :numeric_scale))]
        (sort-column-keys (into (sorted-map) compacted))))))

(defn expand-column [col]
  (cond
    (= col :id)
    id-column-defaults

    (= col :created_at)
    (merge auto-timestamp-defaults {:column_name "created_at"})

    (= col :updated_at)
    (merge auto-timestamp-defaults {:column_name "updated_at"})

    (and (map? col) (= "pk" (:type col)))
    (merge pk-defaults col)

    (and (map? col) (= "fk" (:type col)))
    (merge fk-defaults (dissoc col :target_table :target_column))

    (and (map? col) (= "entity_id" (:type col)))
    (merge entity-id-defaults col)

    (and (map? col) (= "created_at" (:type col)))
    (merge auto-timestamp-defaults col)

    (and (map? col) (= "updated_at" (:type col)))
    (merge auto-timestamp-defaults col)

    :else
    (let [with-common-defaults   (expand-defaults col column-defaults)
          generic-type           (:type with-common-defaults)
          type-defaults-for-type (get type-defaults generic-type {})]
      (merge type-defaults-for-type with-common-defaults))))

(defn pk-shorthand? [idx]
  (and (:is_primary idx)
       (= 1 (count (:columns idx)))
       (let [first-col (first (:columns idx))]
         (= (if (vector? first-col) (first first-col) first-col) "id"))))

(defn fk-shorthand? [idx table-name]
  (and (not (:is_primary idx))
       (not (:is_unique idx))
       (= 1 (count (:columns idx)))
       (let [col-name (first (:columns idx))
             col-name (if (vector? col-name) (first col-name) col-name)]
         (and (str/ends-with? col-name "_id")
              (= (:index_name idx)
                 (str "idx_" table-name "_" col-name))))))

(defn normalize-index [idx table-name]
  (let [base (-> idx
                 (select-keys [:index_name :columns :is_unique :is_primary])
                 (update :columns (fn [pg-array]
                                    (let [raw-cols (.getArray ^PgArray pg-array)]
                                      (mapv (fn [col]
                                              (if (and (string? col) (str/starts-with? col "["))
                                                ;; JSON string, parse it
                                                (let [parsed (json/read-str col)]
                                                  [(first parsed) (keyword (second parsed))])
                                                ;; Regular column name
                                                col))
                                            raw-cols)))))]
    (cond
      (pk-shorthand? base) :pk
      (fk-shorthand? base table-name) {:fk (let [first-col (first (:columns base))]
                                             (if (vector? first-col)
                                               (first first-col)
                                               first-col))}
      :else (remove-defaults base index-defaults))))

(defn extract-schema [table-filter]
  (let [tables (get-tables table-filter)]
    (reduce (fn [acc table]
              (let [columns          (map normalize-column (get-table-columns table))
                    foreign-keys     (get-foreign-keys table)
                    fk-map           (into {} (map (fn [fk]
                                                     [(:column_name fk)
                                                      {:target_table  (:foreign_table_name fk)
                                                       :target_column (:foreign_column_name fk)}])
                                                   foreign-keys))
                    ;; Update fk columns with actual targets
                    updated-columns  (map (fn [col]
                                            (if (and (map? col) (= "fk" (:type col)))
                                              (let [fk-info       (get fk-map (:column_name col))
                                                    target-table  (:target_table fk-info)
                                                    target-column (:target_column fk-info)]
                                                (cond-> (assoc col :target_table target-table)
                                                  (and target-column
                                                       (not (= (:column_name col) (str target-table "_" target-column))))
                                                  (assoc :target_column target-column)))
                                              col))
                                          columns)
                    indexes          (map #(normalize-index % table) (get-table-indexes table))
                    ;; Filter out PK indexes since they're implicit in pk columns
                    filtered-indexes (remove (fn [idx]
                                               (or (= idx :pk)
                                                   (and (map? idx)
                                                        (:is_primary idx)
                                                        (= ["id"] (:columns idx)))))
                                             indexes)
                    ;; Filter out FK indexes for columns with fk type
                    fk-columns       (set (map :column_name (filter #(and (map? %) (= "fk" (:type %))) updated-columns)))
                    final-indexes    (remove (fn [idx]
                                               (and (map? idx)
                                                    (:fk idx)
                                                    (contains? fk-columns (:fk idx))))
                                             filtered-indexes)]
                (assoc acc (keyword table)
                       {:columns updated-columns
                        :indexes final-indexes})))
            (sorted-map)
            tables)))

(defn expand-index [idx table-name]
  (cond
    (= idx :pk)
    {:index_name (str table-name "_pkey")
     :columns    ["id"]
     :is_unique  true
     :is_primary true}

    (and (map? idx) (:fk idx))
    (let [col-name (:fk idx)]
      {:index_name (str "idx_" table-name "_" col-name)
       :columns    [col-name]
       :is_unique  false
       :is_primary false})

    :else
    (expand-defaults idx index-defaults)))

(defn expand-schema [compact-schema]
  (reduce-kv (fn [acc table-key table-def]
               (let [table-name       (name table-key)
                     expanded-columns (map expand-column (:columns table-def))
                     ;; Add implicit indexes for pk and fk columns
                     pk-indexes       (map (fn [col]
                                             (when (= col :id)
                                               {:index_name (str table-name "_pkey")
                                                :columns    ["id"]
                                                :is_unique  true
                                                :is_primary true}))
                                           (:columns table-def))
                     fk-indexes       (map (fn [col]
                                             (when (and (map? col) (= "fk" (:type col)))
                                               {:index_name (str "idx_" table-name "_" (:column_name col))
                                                :columns    [(:column_name col)]
                                                :is_unique  false
                                                :is_primary false}))
                                           (:columns table-def))
                     explicit-indexes (map #(expand-index % table-name) (:indexes table-def))
                     all-indexes      (concat (remove nil? pk-indexes)
                                              (remove nil? fk-indexes)
                                              explicit-indexes)]
                 (assoc acc table-key
                        {:columns expanded-columns
                         :indexes all-indexes})))
             {}
             compact-schema))

(defn output [& args]
  (let [table-filter (or (first args) "%")]
    (extract-schema table-filter)))

(comment
  (output)
  (output "data_app%"))
