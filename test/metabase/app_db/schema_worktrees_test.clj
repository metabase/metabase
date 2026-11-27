(ns metabase.app-db.schema-worktrees-test
  "Tests of the remote sync worktree schema of the app DB: its keys, foreign keys, views and constraint names."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection DatabaseMetaData ResultSet)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- result-rows
  "The rows of the JDBC result set `rs`, each the map that `f` makes of it."
  [^ResultSet rs f]
  (with-open [rs rs]
    (loop [acc []]
      (if (.next rs)
        (recur (conj acc (f rs)))
        acc))))

(defn- lower-name
  "The lower-cased string `s` from the database metadata."
  [s]
  (u/lower-case-en s))

(defn- partition?
  "Whether `table` is a Postgres partition of another of `tables`, named `<parent>_YYYY_MM`."
  [tables table]
  (boolean (when-let [[_ parent] (re-matches #"(.+)_\d{4}_\d{2}" table)]
             (contains? tables parent))))

(defn- grouped-rows
  "The rows of the JDBC result set `rs` grouped by the string column `group-column`, each group the vector of the maps
  that `f` makes of its rows, in the order of the integer column `order-column`."
  [^ResultSet rs group-column order-column f]
  (update-vals (group-by first (result-rows rs (fn [^ResultSet rs]
                                                 [(.getString rs ^String group-column)
                                                  (.getInt rs ^String order-column)
                                                  (f rs)])))
               #(mapv last (sort-by second %))))

(defn- table-schema
  "The columns of `table`, its non-null columns, its unique keys as column sets and its foreign keys as
  `{:columns [...] :parent table :cascade? bool}` maps, read from `md`."
  [^DatabaseMetaData md catalog schema table]
  (let [columns (result-rows (.getColumns md catalog schema table "%")
                             (fn [^ResultSet rs]
                               [(lower-name (.getString rs "COLUMN_NAME")) (= "NO" (.getString rs "IS_NULLABLE"))]))]
    {:columns     (into #{} (map first) columns)
     :not-null    (into #{} (keep (fn [[column not-null?]] (when not-null? column))) columns)
     :unique-keys (into #{}
                        (comp (map #(into #{} (keep identity) %)) (filter seq))
                        (vals (dissoc (grouped-rows (.getIndexInfo md catalog schema table true true)
                                                    "INDEX_NAME" "ORDINAL_POSITION"
                                                    #(some-> (.getString ^ResultSet % "COLUMN_NAME") lower-name))
                                      nil)))
     :foreign-keys (into []
                         (map (fn [rows] {:columns  (mapv first rows)
                                          :parent   (second (first rows))
                                          :cascade? (= DatabaseMetaData/importedKeyCascade (nth (first rows) 2))}))
                         (vals (grouped-rows (.getImportedKeys md catalog schema table) "FK_NAME" "KEY_SEQ"
                                             (fn [^ResultSet rs]
                                               [(lower-name (.getString rs "FKCOLUMN_NAME"))
                                                (lower-name (.getString rs "PKTABLE_NAME"))
                                                (.getShort rs "DELETE_RULE")]))))}))

(defn app-db-schema
  "The base tables of the app DB but the Postgres partitions and the search index tables that search creates at run
  time, each the lower-cased name of a table mapped to its [[table-schema]] and its foreign keys as
  `[column parent-table]` pairs under `:fks`."
  []
  (t2/with-connection [^Connection conn]
    (let [^DatabaseMetaData md (.getMetaData conn)
          catalog              (.getCatalog conn)
          schema               (.getSchema conn)
          tables               (result-rows (.getTables md catalog schema "%" (into-array String ["TABLE" "PARTITIONED TABLE"]))
                                            #(.getString ^ResultSet % "TABLE_NAME"))]
      (into {}
            (for [table tables
                  :let  [lower (lower-name table)]
                  :when (not (or (str/starts-with? lower "search_index__")
                                 (partition? (set (map lower-name tables)) lower)))
                  :let  [table-info (table-schema md catalog schema table)]]
              [lower (assoc table-info :fks (for [{:keys [columns parent]} (:foreign-keys table-info)
                                                  column                   columns]
                                              [column parent]))])))))

(defn worktree-tables
  "The tables of `schema` with a `worktree_id` column."
  [schema]
  (into #{} (keep (fn [[table {:keys [columns]}]] (when (contains? columns "worktree_id") table))) schema))

(defn- worktree-id-default
  "The default of the `worktree_id` column of `table`, as the app DB reports it."
  [table]
  (t2/with-connection [^Connection conn]
    (let [^DatabaseMetaData md (.getMetaData conn)]
      (first (for [t     [table (u/upper-case-en table)]
                   c     ["worktree_id" "WORKTREE_ID"]
                   value (result-rows (.getColumns md (.getCatalog conn) (.getSchema conn) t c)
                                      #(.getString ^ResultSet % "COLUMN_DEF"))]
               value)))))

(deftest default-worktree-is-default-worktree-id-test
  (testing "app DB holds exactly one default worktree, whose id is default-worktree-id"
    (is (= [mdb/default-worktree-id]
           (t2/select-fn-vec :id :remote_sync_worktree :is_default true))))
  (testing "worktree_id columns default to default-worktree-id"
    (is (= (str mdb/default-worktree-id)
           (some-> (worktree-id-default "collection") (str/replace #"[^0-9]" ""))))))

(defn- relation-columns
  "The lower-cased column names of the table or view `relation`, as the app DB reports them."
  [relation]
  (t2/with-connection [^Connection conn]
    (let [^DatabaseMetaData md (.getMetaData conn)]
      (into #{}
            (mapcat (fn [r]
                      (result-rows (.getColumns md (.getCatalog conn) (.getSchema conn) r "%")
                                   #(lower-name (.getString ^ResultSet % "COLUMN_NAME")))))
            [relation (u/upper-case-en relation)]))))

(deftest worktree-views-have-table-columns-test
  (doseq [[table view] @#'mdb.worktree/view-substitutions]
    (testing (str (name view) " has the columns of " (name table) " and worktree_id")
      (is (= (conj (relation-columns (name table)) "worktree_id")
             (relation-columns (name view)))))))

(def ^:private unique-key-allowlist
  "The tables with `worktree_id` whose unique keys may leave it out; add one only when a row is unique across every
  worktree."
  #{;; A user has one checkout, whichever worktree it is in.
    "remote_sync_worktree_user"})

(defn- primary-key
  "The column set of the primary key of `table`."
  [table]
  (t2/with-connection [^Connection conn]
    (let [^DatabaseMetaData md (.getMetaData conn)]
      (into #{}
            (mapcat (fn [t]
                      (result-rows (.getPrimaryKeys md (.getCatalog conn) (.getSchema conn) t)
                                   #(lower-name (.getString ^ResultSet % "COLUMN_NAME")))))
            [table (u/upper-case-en table)]))))

(deftest worktree-unique-keys-include-worktree-id-test
  (testing "every unique key but the primary key of a table with worktree_id includes worktree_id"
    (let [schema (app-db-schema)
          bad    (for [table      (sort (set/difference (worktree-tables schema) unique-key-allowlist))
                       :let       [pk (primary-key table)]
                       unique-key (get-in schema [table :unique-keys])
                       :when      (and (not= pk unique-key)
                                       (not (contains? unique-key "worktree_id")))]
                   (format "%s: %s" table (str/join ", " (sort unique-key))))]
      (is (empty? bad) (str "Unique keys without worktree_id:\n" (str/join "\n" bad))))))

(deftest worktree-foreign-keys-are-composite-test
  (testing "a non-null foreign key between two tables with worktree_id has a composite one with worktree_id first"
    (let [schema    (app-db-schema)
          worktree? (worktree-tables schema)
          bad       (for [table                  (sort worktree?)
                          :let                   [{:keys [foreign-keys not-null]} (schema table)]
                          {[column] :columns
                           :keys    [columns parent]} foreign-keys
                          :when                  (and (= 1 (count columns))
                                                      (not= "worktree_id" column)
                                                      (not= table parent)
                                                      (worktree? parent)
                                                      (contains? not-null column)
                                                      (not (some #(= {:columns ["worktree_id" column] :parent parent}
                                                                     (select-keys % [:columns :parent]))
                                                                 foreign-keys)))]
                      (format "%s.%s -> %s" table column parent))]
      (is (empty? bad) (str "Non-null foreign keys without a composite one:\n" (str/join "\n" bad))))))

(deftest worktree-foreign-keys-cascade-test
  (testing "every foreign key over worktree_id deletes its rows with the row it references"
    (let [bad (for [[table {:keys [foreign-keys]}] (sort-by key (app-db-schema))
                    {:keys [columns parent cascade?]} foreign-keys
                    :when (and (some #{"worktree_id"} columns) (not cascade?))]
                (format "%s (%s) -> %s" table (str/join ", " columns) parent))]
      (is (empty? bad) (str "Foreign keys over worktree_id without ON DELETE CASCADE:\n" (str/join "\n" bad))))))

(defn- generated-constraint-names
  "The `table.constraint` names of the H2 constraints that H2 named itself, but those of the Liquibase tables and the
  search index tables that search creates at run time."
  []
  (t2/with-connection [^Connection conn]
    (with-open [statement (.createStatement conn)]
      (result-rows (.executeQuery statement (str "SELECT TABLE_NAME, CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
                                                 "WHERE CONSTRAINT_SCHEMA = 'PUBLIC' "
                                                 "AND REGEXP_LIKE(CONSTRAINT_NAME, '^CONSTRAINT_[0-9A-F]+$') "
                                                 "AND TABLE_NAME NOT LIKE 'DATABASECHANGELOG%' "
                                                 "AND NOT REGEXP_LIKE(TABLE_NAME, '^SEARCH_INDEX__') ORDER BY 1, 2"))
                   (fn [^ResultSet rs]
                     (str (lower-name (.getString rs 1)) "." (.getString rs 2)))))))

(deftest constraints-are-named-test
  (when (= :h2 (mdb/db-type))
    (testing "every constraint has a name, since a changeset can name a generated one only through a lookup"
      (let [bad (generated-constraint-names)]
        (is (empty? bad) (str "Constraints with generated names:\n" (str/join "\n" bad)))))))
