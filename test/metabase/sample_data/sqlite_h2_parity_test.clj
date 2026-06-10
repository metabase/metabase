(ns metabase.sample-data.sqlite-h2-parity-test
  "Row-by-row comparison of the bundled SQLite sample database (resources/sample-database.sqlite) against
  the legacy H2 snapshot (resources/sample-database.db.mv.db) it was converted from. The two should hold
  essentially identical values.

  The data is read with the real H2 and SQLite JDBC drivers but otherwise deliberately avoids Metabase
  production code (no driver multimethods, sync, or sample-data extraction): the point is to validate the
  bytes in the converted file, not the application's view of them."
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]))

(set! *warn-on-reflection* true)

(def ^:private tables
  ["ACCOUNTS" "ANALYTIC_EVENTS" "FEEDBACK" "INVOICES" "ORDERS" "PEOPLE" "PRODUCTS" "REVIEWS" "_METABASE_METADATA"])

(defn- order-column
  "Stable sort key so both databases yield rows in the same order. Every table has an ID except the
  key/value metadata table."
  [table]
  (if (= table "_METABASE_METADATA") "keypath" "id"))

(defn- resource-path ^String [resource]
  (.getAbsolutePath (io/as-file (io/resource resource))))

(def ^:private h2-spec
  (delay {:classname   "org.h2.Driver"
          :subprotocol "h2"
          :subname     (str "file:" (str/replace (resource-path "sample-database.db.mv.db") #"\.mv\.db$" "")
                            ";ACCESS_MODE_DATA=r;USER=GUEST;PASSWORD=guest")}))

(def ^:private sqlite-spec
  (delay {:classname   "org.sqlite.JDBC"
          :subprotocol "sqlite"
          :subname     (resource-path "sample-database.sqlite")}))

(defn- canonical
  "Normalize a JDBC-returned scalar so the H2 and SQLite renderings of the *same* logical value compare
  equal, while genuinely different values still differ:
   - numbers are compared numerically (H2 returns Long/Double, SQLite Integer/Double for the same column);
   - booleans are folded to 1.0/0.0 (SQLite has no boolean type, so H2 `true`/`false` lands as `1`/`0`);
   - dates/timestamps are reduced to a canonical `yyyy-MM-dd[ HH:mm:ss[.fff]]` wall-clock string. H2 returns
     java.sql.Timestamp/Date (space separator, seconds always present); SQLite returns ISO-8601 strings
     (`T` separator, seconds and zero fractionals omitted). Seconds are padded and trailing fractional zeros
     stripped on both sides so only a real wall-clock difference survives."
  [v]
  (cond
    (nil? v)     ::nil
    (boolean? v) (if v 1.0 0.0)
    (number? v)  (double v)
    :else
    (let [s (str v)]
      (if-let [[_ date time frac] (re-matches #"(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?(\.\d+)?" s)]
        (str date
             (when time (str " " (cond-> time (= 5 (count time)) (str ":00"))))
             (when frac
               (let [f (str/replace frac #"0+$" "")]
                 (when (not= f ".") f))))
        s))))

(defn- read-rows
  "All rows of `table` from `spec`, ordered deterministically, with every value canonicalized."
  [spec table]
  (mapv #(update-vals % canonical)
        (jdbc/query spec [(str "SELECT * FROM " table " ORDER BY " (order-column table))])))

(defn- truncate [v]
  (let [s (str v)]
    (if (> (count s) 80) (str (subs s 0 80) "…") s)))

(defn- value-mismatches
  "Per-column value differences between aligned H2 and SQLite rows."
  [h2-rows sqlite-rows]
  (for [[idx h2-row sqlite-row] (map vector (range) h2-rows sqlite-rows)
        column                  (sort (keys h2-row))
        :let [a (get h2-row column)
              b (get sqlite-row column)]
        :when (not= a b)]
    {:row idx :id (:id h2-row) :column column
     :h2 (truncate a) :sqlite (truncate b)}))

(deftest sqlite-matches-h2-snapshot-test
  (doseq [table tables]
    (testing table
      (let [h2-rows     (read-rows @h2-spec table)
            sqlite-rows (read-rows @sqlite-spec table)]
        (is (= (count h2-rows) (count sqlite-rows))
            (format "%s: row count differs (H2 %d, SQLite %d)" table (count h2-rows) (count sqlite-rows)))
        (let [mismatches (value-mismatches h2-rows sqlite-rows)]
          (is (empty? mismatches)
              (format "%s: %d value mismatch(es) across %d distinct column(s). First 10:\n%s"
                      table
                      (count mismatches)
                      (count (distinct (map :column mismatches)))
                      (str/join "\n" (map pr-str (take 10 mismatches))))))))))
