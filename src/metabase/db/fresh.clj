(ns metabase.db.fresh
  (:import java.sql.DatabaseMetaData
           java.sql.ResultSet)
  (:require [yaml.core :as yaml]
            [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- get-yes-no-string [^ResultSet rset ^String column-name]
  (condp = (.getString rset column-name)
    "YES" true
    false))

(defn- result-set-results* [^ResultSet rset thunk]
  (loop [acc []]
    (if-not (.next rset)
      acc
      (recur (conj acc (thunk))))))

(defmacro result-set-results {:style/indent 1} [[result-set-binding result-set-expr] & body]
  (let [result-set-binding (vary-meta result-set-binding assoc :tag 'ResultSet)]
    `(with-open [^ResultSet rset# ~result-set-expr]
       (result-set-results*
        rset#
        (let [~result-set-binding rset#]
          (fn []
            ~@body))))))

(defn- all-columns [^DatabaseMetaData dbmeta]
  (result-set-results [rset (.getColumns dbmeta nil nil nil nil)]
    {:table-name     (.getString rset "TABLE_NAME")
     :name           (.getString rset "COLUMN_NAME")
     :nullable?      (get-yes-no-string rset "IS_NULLABLE")
     :position       (.getInt rset "ORDINAL_POSITION")
     :autoincrement? (get-yes-no-string rset "IS_AUTOINCREMENT")
     #_:jdbc-type    #_ (.getInt rset "DATA_TYPE")
     :type           (let [type-name (.getString rset "TYPE_NAME")]
                       (condp = type-name
                         "text"        "${text.type}"
                         "timestamptz" "${timestamp.type}"
                         "int4"        "integer"
                         "serial"      "integer"
                         "bool"        "boolean"
                         type-name))
     :default        (when-let [default (.getString rset "COLUMN_DEF")]
                       (let [default (str/replace default #"'(.+)'::.+" "$1")]
                         (condp = (.getString rset "TYPE_NAME")
                           "int4" (Integer/parseInt default)
                           "bool" (Boolean/parseBoolean default)
                           default)))
     :remarks        (.getString rset "REMARKS")}))

(defn- all-primary-keys [^DatabaseMetaData dbmeta]
  (result-set-results [rset (.getPrimaryKeys dbmeta nil nil nil)]
    {:table-name  (.getString rset "TABLE_NAME")
     :column-name (.getString rset "COLUMN_NAME")
     :key-seq     (.getInt rset "KEY_SEQ")
     :name        (.getString rset "PK_NAME")}))

(defn- all-foreign-keys [^DatabaseMetaData dbmeta]
  (result-set-results [rset (.getExportedKeys dbmeta nil nil nil)]
    (letfn [(get-rule [^String column-name]
              (condp = (.getInt rset column-name)
                DatabaseMetaData/importedKeyNoAction   :none
                DatabaseMetaData/importedKeyCascade    :cascade
                DatabaseMetaData/importedKeySetNull    :set-null
                DatabaseMetaData/importedKeySetDefault :set-default
                DatabaseMetaData/importedKeyRestrict   :none))]
      {:pk          {:table-name  (.getString rset "PKTABLE_NAME")
                     :column-name (.getString rset "PKCOLUMN_NAME")}
       :fk          {:table-name  (.getString rset "FKTABLE_NAME")
                     :column-name (.getString rset "FKCOLUMN_NAME")}
       :name        (or (.getString rset "FK_NAME")
                        (.getString rset "PK_NAME"))
       :update-rule (get-rule "UPDATE_RULE")
       :delete-rule (get-rule "DELETE_RULE")})))

(defn- table-indexes [^DatabaseMetaData dbmeta ^String table-name]
  (result-set-results [rset (.getIndexInfo dbmeta nil nil table-name false false)]
    {:table-name  (.getString rset "TABLE_NAME")
     :unique?     (not (.getBoolean rset "NON_UNIQUE"))
     :name        (.getString rset "INDEX_NAME")
     :column-name (.getString rset "COLUMN_NAME")
     :position    (.getInt rset "ORDINAL_POSITION")}))

(defn- tables [^DatabaseMetaData dbmeta]
  (let [columns (all-columns dbmeta)
        pks     (all-primary-keys dbmeta)
        fks     (all-foreign-keys dbmeta)]
    (result-set-results [rset (.getTables dbmeta nil nil nil (into-array String ["TABLE"]))]
      (let [table-name             (.getString rset "TABLE_NAME")
            pks                    (->> pks
                                        (filter (fn [pk] (= (:table-name pk) table-name)))
                                        vec)
            fks                    (->> fks
                                        (filter (fn [fk] (= (get-in fk [:fk :table-name]) table-name))))
            col-fks                (->> fks
                                        (filter (fn [fk] (#{:none :cascade} (:delete-rule fk)))))
            other-fks              (->> fks
                                        (remove (fn [fk] (#{:none :cascade} (:delete-rule fk)))))
            indexes                (table-indexes dbmeta table-name)
            unique-indexes         (into {}
                                         (map (fn [[k vs]]
                                                [k (mapv :column-name (sort-by :position vs))]))
                                         (group-by :name (filter :unique? indexes)))
            one-col-unique-indexes (into {}
                                         (comp (filter (fn [[_k cols]]
                                                         (= (count cols) 1)))
                                               (map (fn [[k cols]]
                                                      [(first cols) k])))
                                         unique-indexes)
            other-unique-indexes   (into {}
                                         (filter (fn [[_k cols]]
                                                   (> (count cols) 1)))
                                         unique-indexes)
            other-indexes          (remove :unique? indexes)]
        {:name               table-name
         :remarks            (.getString rset "REMARKS")
         :columns            (->> columns
                                  (filter (fn [col] (= (:table-name col) table-name)))
                                  (sort-by :position)
                                  (map (fn [{col-name :name, :as col}]
                                         (assoc col
                                                :unique-index (get one-col-unique-indexes col-name)
                                                :pk (some
                                                     (fn [pk]
                                                       (when (= (:column-name pk) col-name)
                                                         (:name pk)))
                                                     pks)
                                                :fk (some
                                                     (fn [fk]
                                                       (when (= (get-in fk [:fk :column-name]) col-name)
                                                         (merge (:pk fk)
                                                                fk)))
                                                     col-fks))))
                                  vec)
         :indexes            (->> (group-by :name other-indexes)
                                  (into {} (map (fn [[k v]]
                                                  [k (map :column-name (sort-by :position v))]))))
         :unique-constraints other-unique-indexes
         :fks                other-fks
         :dependencies       (set (map (comp :table-name :pk) fks))}))))

(defn- compare-tables [{t1-deps :dependencies, t1-name :name} {t2-deps :dependencies, t2-name :name}]
  (cond
    ;; t1 depends on t2: sort t2 first
    (contains? t1-deps t2-name)          1
    ;; t2 depends on t1: sort t1 first
    (contains? t2-deps t1-name)          -1
    ;; t1 has no dependencies by t2 does: sort t1 first
    (and (empty? t1-deps) (seq t2-deps)) -1
    (and (empty? t2-deps) (seq t1-deps)) 1
    :else                                (compare t1-name t2-name)))

(def excluded-tables #{"databasechangelog" "databasechangeloglock"})

(defn sorted-tables []
  (->> (with-open [conn (.getConnection metabase.db.env/data-source)]
         (let [dbmeta (.getMetaData conn)]
           (tables dbmeta)))
       (remove (fn [table] (contains? excluded-tables (:name table))))
       (sort-by identity compare-tables)))

#_(spit "resources/migrations/tables.edn" (metabase.util/pprint-to-str (sorted-tables)))

(defn column->yaml [column]
  (merge
   {:name (:name column)
    :type (:type column)}
   (when (:remarks column)
     {:remarks (:remarks column)})
   (when (:autoincrement? column)
     {:autoIncrement true})
   (let [default (:default column)]
     (when (and (some? default)
                (not (:autoincrement? column)))
       (cond
         (integer? default)              {:defaultValueNumeric default}
         (boolean? default)              {:defaultValueBoolean default}
         (= default "CURRENT_TIMESTAMP") {:defaultValueComputed "current_timestamp"}
         :else                           {:defaultValue default})))
   (when-let [constraints (not-empty
                           (merge
                            (when-not (:nullable? column)
                              {:nullable false})
                            (when (:pk column)
                              {:primaryKey true})
                            (when (:unique-index column)
                              {:unique               true
                               :uniqueConstraintName (:unique-index column)})
                            (when-let [fk (:fk column)]
                              (merge
                               {:references (format "%s(%s)"
                                                    (:table-name fk)
                                                    (:column-name fk))}
                               (case (:update-rule fk)
                                 :none nil)
                               (case (:delete-rule fk)
                                 :none    nil
                                 :cascade {:deleteCascade true})
                               (when (:name fk)
                                 {:foreignKeyName (:name fk)})))))]
     {:constraints constraints})))

(defn table->changes [table]
  (cons
   {:createTable
    {:tableName (:name table)
     :remarks   (:remarks table)
     :columns   (mapv column->yaml (:columns table))}}
   (concat
    (for [[index-name cols] (:indexes table)]
      {:createIndex
       {:tableName (:name table)
        :indexName index-name
        :columns   (vec cols)}})
    (for [[constraint-name cols] (:unique-constraints table)]
      {:addUniqueConstraint
       {:tableName      (:name table)
        :columnNames    (vec cols)
        :constraintName constraint-name}})
    (for [fk (:fks table)]
      {:addForeignKeyConstraint
       {:baseTableName         (get-in fk [:fk :table-name])
        :baseColumnNames       (get-in fk [:fk :column-name])
        :referencedTableName   (get-in fk [:pk :table-name])
        :referencedColumnNames (get-in fk [:pk :column-name])
        :constraintName        (:name fk)
        :onDelete              (case (:delete-rule fk)
                                 ;; :none     "RESTRICT"
                                 ;; :cascade  "CASCADE"
                                 :set-null "SET NULL"
                                 :default  "SET DEFAULT")}}))))

(defn spit-yaml []
  (let [changes (mapcat table->changes (sorted-tables))
        counter (atom 0)]
    (spit
     "resources/migrations/fresh.yaml"
     (yaml/generate-string
      {:databaseChangeLog
       (concat
        [{:property
          {:name "timestamp.type"
           :value "timestamp with time zone"
           :dbms ["postgres" "h2"]}}
         {:property
          {:name "timestamp.type"
           :value "timestamp(6)"
           :dbms ["mysql" "mariadb"]}}
         {:property
          {:name "text.type"
           :value "text"
           :dbms ["postgres" "h2"]}}
         {:property
          {:name "text.type"
           :value "longtext"
           :dbms ["mysql" "mariadb"]}}]
        (for [change changes]
          {:changeSet
           {:id      (format "v00.00-%03d" (swap! counter inc))
            :author  "metabase"
            :changes [change]}}))}
      :dumper-options {:flow-style   :block
                       :scalar-style :plain}))))
