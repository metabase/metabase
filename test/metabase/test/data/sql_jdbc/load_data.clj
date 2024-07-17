(ns metabase.test.data.sql-jdbc.load-data
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.reader.edn :as edn]
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.spec :as spec]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defmulti row-xform
  "Return a transducer that should be applied to each row when loading test data. Default is [[identity]], e.g. apply no
  transform, but a few common ones are available, such as [[add-ids-xform]] and [[maybe-add-ids-xform]].

    (defmethod row-xform :my-driver
      [_driver _dbdef _tabledef]
      (add-ids-xform))

  Do not rely on the 0-arity (init) or 1-arity (completing) of the transducer, since they may not be called, or may be
  called with transient objects."
  {:arglists '([driver dbdef tabledef]), :added "0.51.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod row-xform :sql-jdbc/test-extensions
  [_driver _dbdef _tabledef]
  identity)

(defmulti chunk-size
  "When loading test data, load rows in chunks of this size. Default is 200. To load data all at once without chunking,
  override this and return `nil`."
  {:arglists '([driver dbdef tabledef]), :added "0.51.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod chunk-size :sql-jdbc/test-extensions
  [_driver _dbdef _tabledef]
  200)

(defmulti chunk-xform
  "Transducer that should be applied to each chunk of rows to be loaded (based on [[chunk-size]]). Applied to rows that
  have been transformed with [[row-xform]]. An example implementation might be something that writes each chunk to a CSV file like

    (defmethod chunk-xform :my-driver
      [_driver _dbdef _tabledef]
      (map (fn [rows]
             (write-rows-to-csv! rows)
             rows)))

  Do not rely on the 0-arity (init) or 1-arity (completing) of the transducer, since they may not be called, or may be
  called with transient objects."
  {:arglists '([driver dbdef tabledef]), :added "0.51.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod chunk-xform :sql-jdbc/test-extensions
  [_driver _dbdef _tabledef]
  identity)

(defmulti do-insert!
  "Low-level method used internally to load a chunk of `rows` into table with `table-identifier`. Chunk size is
  dependent on [[chunk-size]].

  You usually do not need to override this -- you can usually override [[row-xform]] or [[chunk-xform]] instead. You
  can also override [[metabase.test.data.sql.ddl/insert-rows-honeysql-form]]
  or [[metabase.test.data.sql.ddl/insert-rows-ddl-statements]] instead if you only need to change DDL statement(s)
  themselves, rather than how they are executed."
  {:arglists '([driver ^java.sql.Connection conn table-identifier rows])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Loading Data                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;;;; Loading Table Data

(defn add-ids-xform
  "Add an `:id` column to each row in each row chunk, for databases that should have data inserted with the ID
  explicitly specified."
  []
  (let [id-counter (atom 0)]
    (map (fn [row]
           (assoc row :id (swap! id-counter inc))))))

(deftest ^:parallel add-ids-xform-test
  (is (= [{:name "A", :id 1} {:name "B", :id 2} {:name "C", :id 3} {:name "D", :id 4}]
         (into []
               (add-ids-xform)
               [{:name "A"} {:name "B"} {:name "C"} {:name "D"}]))))

(defn maybe-add-ids-xform
  "Like [[add-ids-xform]], but only adds `:id` to tables that don't have a `:pk` column."
  [tabledef]
  (if-not (some :pk? (:field-definitions tabledef))
    (add-ids-xform)
    identity))

(defn- row-maps-xform
  "Transform applied by default that converts each row from a vector to a map keyed by `:field-name` from the table
  definition."
  [tabledef]
  (let [fields-for-insert (mapv (comp keyword :field-name)
                                (:field-definitions tabledef))]
    (map (fn [row]
           (zipmap fields-for-insert row)))))

(defn- table-identifier
  "Make a Honey SQL table identifier for the table we're loading."
  [driver {:keys [database-name], :as _dbdef} {:keys [table-name], :as _tabledef}]
  (let [components (for [component (sql.tx/qualified-name-components driver database-name table-name)]
                     (ddl.i/format-name driver (u/qualified-name component)))]
    (sql.qp/->honeysql driver (apply h2x/identifier :table components))))

(mr/def ::rf
  [:function
   [:=> [:cat]           :any]
   [:=> [:cat :any]      :any]
   [:=> [:cat :any :any] :any]])

(mr/def ::xform
  [:=> [:cat ::rf] ::rf])

(mu/defn ^:private reducible-chunked-rows :- (lib.schema.common/instance-of-class clojure.lang.IReduceInit)
  [rows        :- [:sequential :any] ; rows is allowed to be empty.
   chunk-size  :- [:maybe [:int {:min 1}]]
   row-xform   :- ::xform
   chunk-xform :- ::xform]
  (let [xform (comp (map (fn [chunk]
                           (into [] row-xform chunk)))
                    chunk-xform)]
    (reify clojure.lang.IReduceInit
      (reduce [_this rf init]
        (if chunk-size
          ;; using `transduce` here inside a `reduce` implementation is a little questionable here but the transducer
          ;; for `partition-all` doesn't actually work unless the completing arity gets called =(
          (transduce
           (comp (partition-all chunk-size)
                 xform)
           rf
           init
           rows)
          ;; for chunk-size = nil simulate a single mega chunk by wrapping rows, that way the chunk-xform can still work
          ;; the way we expect.
          (transduce
           xform
           rf
           init
           [rows]))))))

(deftest ^:parallel reducible-chunked-rows-test
  (letfn [(reducible-chunks* [chunk-size]
            (reducible-chunked-rows
             [{:a 1} {:b 2} {:c 3} {:d 4}]
             chunk-size
             (add-ids-xform)
             (map (fn [chunk]
                    (mapv (fn [row]
                            (assoc row ::chunk chunk))
                          chunk)))))]
    (testing "unchunked"
      (is (= [[{:a 1, :id 1, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:b 2, :id 2, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:c 3, :id 3, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:d 4, :id 4, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}]]
             (into [] (reducible-chunks* nil)))))
    (testing "chunk size = 5"
      (is (= [[{:a 1, :id 1, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:b 2, :id 2, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:c 3, :id 3, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:d 4, :id 4, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}]]
             (into [] (reducible-chunks* 5)))))
    (testing "chunk size = 2"
      (is (= [[{:a 1, :id 1, ::chunk [{:a 1, :id 1} {:b 2, :id 2}]}
               {:b 2, :id 2, ::chunk [{:a 1, :id 1} {:b 2, :id 2}]}]
              [{:c 3, :id 3, ::chunk [{:c 3, :id 3} {:d 4, :id 4}]}
               {:d 4, :id 4, ::chunk [{:c 3, :id 3} {:d 4, :id 4}]}]]
             (into [] (reducible-chunks* 2)))))))

(mu/defn ^:private reducible-chunks  :- (lib.schema.common/instance-of-class clojure.lang.IReduceInit)
  [driver   :- :keyword
   dbdef    :- [:map [:database-name :string]]
   tabledef :- [:map [:table-name :string]]]
  (let [rows        (:rows tabledef)
        chunk-size  (chunk-size driver dbdef tabledef)
        row-xform   (comp
                     (row-maps-xform tabledef)
                     (row-xform driver dbdef tabledef))
        chunk-xform (chunk-xform driver dbdef tabledef)]
    (reducible-chunked-rows rows chunk-size row-xform chunk-xform)))

(driver/register! ::h2-unchunked, :parent :h2)

(defmethod chunk-size ::h2-unchunked
  [_driver _dbdef _tabledef]
  nil)

(driver/register! ::h2-chunked, :parent :h2)

(defmethod chunk-size ::h2-chunked
  [_driver _dbdef _tabledef]
  5)

(deftest ^:parallel reducible-chunks-test
  (let [dbdef    (tx/get-dataset-definition metabase.test.data.dataset-definitions/test-data)
        tabledef (m/find-first
                  #(= (:table-name %) "categories")
                  (:table-definitions dbdef))]
    (is (some? tabledef))
    (letfn [(chunks [driver]
              (into []
                    (comp (take 2)
                          (map (fn [chunk]
                                 (into [] (take 3) chunk))))
                    (reducible-chunks driver dbdef tabledef)))]
      (testing ::h2-unchunked
        ;; only one chunk, we took the first 3 rows
        (is (= [[{:name "African"}
                 {:name "American"}
                 {:name "Artisan"}]]
               (chunks ::h2-unchunked))))
      (testing ::h2-chunked
        ;; many chunks of size 5, we took the first 3 rows from the first 2 chunks.
        (is (= [[{:name "African"}
                 {:name "American"}
                 {:name "Artisan"}]
                [{:name "Bakery"}
                 {:name "Bar"}
                 {:name "Beer Garden"}]]
               (chunks ::h2-chunked)))))))

(driver/register! ::h2-large-chunk-size, :parent :h2)

(defmethod chunk-size ::h2-large-chunk-size
  [_driver _dbdef _tabledef]
  1000)

(deftest ^:parallel large-chunk-size-test
  (testing "Make sure we load EVERY row if we have chunks less than chunk-size"
    (let [driver   ::h2-large-chunk-size
          dbdef    (tx/get-dataset-definition metabase.test.data.dataset-definitions/test-data)
          tabledef (fn [table-name]
                     (m/find-first
                      #(= (:table-name %) table-name)
                      (:table-definitions dbdef)))
          num-rows (fn [table-name]
                     (transduce
                      (keep (fn [chunk]
                              (count chunk)))
                      +
                      0
                      (reducible-chunks driver dbdef (tabledef table-name))))]
      (assert (some? tabledef))
      (are [table-name num-expected-rows] (= num-expected-rows
                                             (num-rows table-name))
        "people" 2500
        "venues" 100))))

(defn- load-data-for-table-definition!
  [driver ^java.sql.Connection conn dbdef tabledef]
  (let [table-identifier (table-identifier driver dbdef tabledef)
        xform            (map (fn [chunk]
                                (log/tracef "Inserting %d rows like: %s" (count chunk) (first chunk))
                                (do-insert! driver conn table-identifier chunk)
                                chunk))
        rf               (xform (constantly nil))
        init             nil]
    (reduce
     rf
     init
     (reducible-chunks driver dbdef tabledef))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              CREATING DBS/TABLES                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; default impl
(mu/defmethod do-insert! :sql-jdbc/test-extensions
  [driver                    :- :keyword
   ^java.sql.Connection conn :- (lib.schema.common/instance-of-class java.sql.Connection)
   table-identifier
   rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier rows)]
    ;; `set-parameters` might try to look at DB timezone; we don't want to do that while loading the data because the
    ;; DB hasn't been synced yet
    (when-let [set-timezone-format-string #_{:clj-kondo/ignore [:deprecated-var]} (sql-jdbc.execute/set-timezone-sql driver)]
      (let [set-timezone-sql (format set-timezone-format-string "'UTC'")]
        (log/debugf "Setting timezone to UTC before inserting data with SQL \"%s\"" set-timezone-sql)
        (jdbc/execute! {:connection conn} [set-timezone-sql])))
    (mt/with-database-timezone-id nil
      (doseq [sql-args statements
              :let     [sql-args (if (string? sql-args)
                                   [sql-args]
                                   sql-args)]]
        (assert (string? (first sql-args))
                (format "Bad sql-args: %s" (pr-str sql-args)))
        (log/tracef "[insert] %s" (pr-str sql-args))
        (try
          ;; TODO - why don't we use [[execute/execute-sql!]] here like we do below?
          ;; Tech Debt Issue: #39375
          (jdbc/execute! {:connection conn} sql-args {:set-parameters (fn [stmt params]
                                                                        (sql-jdbc.execute/set-parameters! driver stmt params))})
          (catch Throwable e
            (throw (ex-info (format "INSERT FAILED: %s" (ex-message e))
                            {:driver   driver
                             :sql-args (into [(str/split-lines (mdb.query/format-sql (first sql-args)))]
                                             (rest sql-args))}
                            e))))))))

(defonce ^:private reference-load-durations
  (delay (edn/read-string (slurp "test_resources/load-durations.edn"))))

(defn- create-db-execute-server-statements!
  "Execute statements to create the DB e.g. the `CREATE DATABASE` statements."
  [driver dbdef]
  (when-let [statements (seq (ddl/create-db-ddl-statements driver dbdef))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     ;; `:server` context = no DB in particular
     (spec/dbdef->spec driver :server dbdef)
     {:write? true}
     (fn [^java.sql.Connection conn]
       ;; make sure we're committing right away, and NOT trying to execute these in a transaction
       (.setAutoCommit conn true)
       (doseq [statement statements]
         (execute/execute-sql! driver conn statement))))))

(defn- create-db-execute-db-ddl-statements!
  "Execute DDL statements like `CREATE TABLE`."
  [driver ^java.sql.Connection conn dbdef options]
  (doseq [statement (apply ddl/create-db-tables-ddl-statements driver dbdef options)]
    (execute/execute-sql! driver conn statement)))

(defn- create-db-load-data!
  "Load the data for each Table."
  [driver ^java.sql.Connection conn {:keys [table-definitions] :as dbdef}]
  (doseq [tabledef table-definitions
          :let     [reference-duration (or (some-> (get @reference-load-durations [(:database-name dbdef) (:table-name tabledef)])
                                                   u/format-nanoseconds)
                                           "NONE")]]
    (u/profile (format "load-data for %s %s %s (reference H2 duration: %s)"
                       (name driver) (:database-name dbdef) (:table-name tabledef) reference-duration)
      (try
        (load-data-for-table-definition! driver conn dbdef tabledef)
        (catch Throwable e
          (throw (ex-info (format "Error loading data: %s" (ex-message e))
                          {:driver driver, :tabledef (update tabledef :rows (fn [rows]
                                                                              (concat (take 10 rows) ['...])))}
                          e)))))))

(defn create-db!
  "Default implementation of [[tx/create-db!]] for SQL drivers. Loads test data into a data
  warehouse (creates tables/columns and inserts rows)."
  {:arglists '([driver dbdef & {:as _options}])}
  [driver dbdef & options]
  (create-db-execute-server-statements! driver dbdef)
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   ;; `:db` context = use the specific database we created in [[create-db-execute-server-statements!]]
   (spec/dbdef->spec driver :db dbdef)
   {:write? true}
   (fn [^java.sql.Connection conn]
     (.setAutoCommit conn true)
     (create-db-execute-db-ddl-statements! driver conn dbdef options)
     (create-db-load-data! driver conn dbdef))))

(defn destroy-db!
  "Default impl of [[metabase.test.data.interface/destroy-db!]] for SQL drivers."
  [driver dbdef]
  (try
    (when-let [statements (seq (ddl/drop-db-ddl-statements driver dbdef))]
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       ;; `:db` context = use the specific database we created in [[create-db-execute-server-statements!]]
       (spec/dbdef->spec driver :server dbdef)
       {:write? true}
       (fn [^java.sql.Connection conn]
         (.setAutoCommit conn true)
         (doseq [statement statements]
           (execute/execute-sql! driver conn statement)))))
    (catch Throwable e
      (throw (ex-info "Error destroying database"
                      {:driver driver, :dbdef dbdef}
                      e)))))
