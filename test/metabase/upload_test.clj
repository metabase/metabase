(ns metabase.upload-test
  (:require
   [clj-bom.core :as bom]
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.upload :as upload]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def ^:private bool-type        ::upload/boolean)
(def ^:private int-type         ::upload/int)
(def ^:private bool-or-int-type ::upload/boolean-or-int)
(def ^:private float-type       ::upload/float)
(def ^:private vchar-type       ::upload/varchar-255)
(def ^:private date-type        ::upload/date)
(def ^:private datetime-type    ::upload/datetime)
(def ^:private offset-dt-type   ::upload/offset-datetime)
(def ^:private text-type        ::upload/text)

(defn- local-infile-on? []
  (= "ON" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              (jdbc/query "show global variables like 'local_infile'")
              first
              :value)))

(defn- set-local-infile! [on?]
  (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec (mt/db)) (str "set global local_infile = " (if on? 1 0))))

(defn- do-with-mysql-local-infile-on
  [thunk]
  (if (or (not= driver/*driver* :mysql)
          (local-infile-on?))
    (thunk)
    (try
      (set-local-infile! true)
      (thunk)
      (finally
        (set-local-infile! false)))))

(defn- do-with-mysql-local-infile-off
  [thunk]
  (if-not (and (= driver/*driver* :mysql)
               (local-infile-on?))
    (thunk)
    (try
      (set-local-infile! false)
      (thunk)
      (finally
        (set-local-infile! true)))))

(defn- do-with-mysql-local-infile-on-and-off
  "Helper for [[with-mysql-local-infile-on-and-off]]"
  [thunk]
  (if (not= driver/*driver* :mysql)
    (thunk)
    (do
      (testing "with local_infile on"
        (do-with-mysql-local-infile-on thunk))
      (testing "with local_infile off"
        (do-with-mysql-local-infile-off thunk)))))

(defmacro ^:private with-mysql-local-infile-on-and-off
  "Exectute the body with local_infile on, and then again with local_infile off"
  [& body]
  `(do-with-mysql-local-infile-on-and-off (fn [] ~@body)))

(defmacro ^:private with-mysql-local-infile-on
  "Exectute the body with local_infile on"
  [& body]
  `(do-with-mysql-local-infile-on (fn [] ~@body)))

(defmacro ^:private with-mysql-local-infile-off
  "Exectute the body with local_infile off"
  [& body]
  `(do-with-mysql-local-infile-off (fn [] ~@body)))

(defn sync-upload-test-table!
  "Creates a table in the app db and syncs it synchronously, setting is_upload=true. Returns the table instance.
  The result is identical to if the table was synced with [[metabase.sync/sync-database!]], but faster because it skips
  syncing every table in the test database."
  [& {:keys [database table-name schema-name]}]
  (let [table-name  (ddl.i/format-name driver/*driver* table-name)
        schema-name (some->> schema-name (ddl.i/format-name driver/*driver*))
        table       (sync-tables/create-or-reactivate-table! database {:name table-name :schema schema-name})]
    (t2/update! :model/Table (:id table) {:is_upload true})
    (binding [upload/*sync-synchronously?* true]
      (#'upload/scan-and-sync-table! database table))
    (t2/select-one :model/Table (:id table))))

(deftest type-detection-and-parse-test
  (doseq [[string-value  expected-value expected-type seps]
          ;; Number-related
          [["0.0"        0              float-type "."]
           ["0.0"        0              float-type ".,"]
           ["0,0"        0              float-type ",."]
           ["0,0"        0              float-type ", "]
           ["0.0"        0              float-type ".’"]
           ["$2"         2              int-type]
           ["$ 3"        3              int-type]
           ["-43€"       -43            int-type]
           ["(86)"       -86            int-type]
           ["($86)"      -86            int-type]
           ["£1000"      1000           int-type]
           ["£1000"      1000           int-type "."]
           ["£1000"      1000           int-type ".,"]
           ["£1000"      1000           int-type ",."]
           ["£1000"      1000           int-type ", "]
           ["£1000"      1000           int-type ".’"]
           ["-¥9"        -9             int-type]
           ["₹ -13"      -13            int-type]
           ["₪13"        13             int-type]
           ["₩-13"       -13            int-type]
           ["₿42"        42             int-type]
           ["-99¢"       -99            int-type]
           ["2"          2              int-type]
           ["-86"        -86            int-type]
           ["9,986,000"  9986000        int-type]
           ["9,986,000"  9986000        int-type "."]
           ["9,986,000"  9986000        int-type ".,"]
           ["9.986.000"  9986000        int-type ",."]
           ["9’986’000"  9986000        int-type ".’"]
           ["$0"         0              int-type]
           ["-1"         -1             int-type]
           ["0"          false          bool-or-int-type]
           ["1"          true           bool-or-int-type]
           ["9.986.000"  "9.986.000"    vchar-type ".,"]
           ["3.14"       3.14           float-type]
           ["3.14"       3.14           float-type "."]
           ["3.14"       3.14           float-type ".,"]
           ["3,14"       3.14           float-type ",."]
           ["3,14"       3.14           float-type ", "]
           ["(3.14)"     -3.14          float-type]
           ["3.14"       3.14           float-type ".’"]
           [".14"        ".14"          vchar-type ".,"] ;; TODO: this should be a float type
           ["0.14"       0.14           float-type ".,"]
           ["-9986.567"  -9986.567      float-type ".,"]
           ["$2.0"       2              float-type ".,"]
           ["$ 3.50"     3.50           float-type ".,"]
           ["-4300.23€"  -4300.23       float-type ".,"]
           ["£1,000.23"  1000.23        float-type]
           ["£1,000.23"  1000.23        float-type "."]
           ["£1,000.23"  1000.23        float-type ".,"]
           ["£1.000,23"  1000.23        float-type ",."]
           ["£1 000,23"  1000.23        float-type ", "]
           ["£1’000.23"  1000.23        float-type ".’"]
           ["-¥9.99"     -9.99          float-type ".,"]
           ["₹ -13.23"   -13.23         float-type ".,"]
           ["₪13.01"     13.01          float-type ".,"]
           ["₩13.33"     13.33          float-type ".,"]
           ["₿42.243646" 42.243646      float-type ".,"]
           ["-99.99¢"    -99.99         float-type ".,"]
           ["."          "."            vchar-type]
           ;; String-related
           [(apply str (repeat 255 "x")) (apply str (repeat 255 "x")) vchar-type]
           [(apply str (repeat 256 "x")) (apply str (repeat 256 "x")) text-type]
           ["86 is my favorite number"   "86 is my favorite number"   vchar-type]
           ["My favorite number is 86"   "My favorite number is 86"   vchar-type]
           ;; Date-related
           [" 2022-01-01 "                    #t "2022-01-01"             date-type]
           [" 2022-02-30 "                    " 2022-02-30 "              vchar-type]
           [" -2022-01-01 "                   #t "-2022-01-01"            date-type]
           [" Jan 1 2018"                     #t "2018-01-01"             date-type]
           [" Jan 02 2018"                    #t "2018-01-02"             date-type]
           [" Jan 30 -2018"                   #t "-2018-01-30"            date-type]
           [" Jan 1, 2018"                    #t "2018-01-01"             date-type]
           [" Jan 02, 2018"                   #t "2018-01-02"             date-type]
           [" Feb 30, 2018"                   " Feb 30, 2018"             vchar-type]
           [" 1 Jan 2018"                     #t "2018-01-01"             date-type]
           [" 02 Jan 2018"                    #t "2018-01-02"             date-type]
           [" 1 Jan, 2018"                    #t "2018-01-01"             date-type]
           [" 02 Jan, 2018"                   #t "2018-01-02"             date-type]
           [" January 1 2018"                 #t "2018-01-01"             date-type]
           [" January 02 2018"                #t "2018-01-02"             date-type]
           [" January 1, 2018"                #t "2018-01-01"             date-type]
           [" January 02, 2018"               #t "2018-01-02"             date-type]
           [" 1 January 2018"                 #t "2018-01-01"             date-type]
           [" 02 January 2018"                #t "2018-01-02"             date-type]
           [" 1 January, 2018"                #t "2018-01-01"             date-type]
           [" 02 January, 2018"               #t "2018-01-02"             date-type]
           [" Saturday, January 1 2000"       #t "2000-01-01"             date-type]
           [" Sunday, January 02 2000"        #t "2000-01-02"             date-type]
           [" Saturday, January 1, 2000"      #t "2000-01-01"             date-type]
           [" Sunday, January 02, 2000"       #t "2000-01-02"             date-type]
           [" 2022-01-01T01:00 "              #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01t01:00 "              #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01 01:00 "              #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01T01:00:00 "           #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01t01:00:00 "           #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01 01:00:00 "           #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01T01:00:00.00 "        #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01t01:00:00.00 "        #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01 01:00:00.00 "        #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01T01:00:00.000000000 " #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01t01:00:00.000000000 " #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01 01:00:00.000000000 " #t "2022-01-01T01:00"       datetime-type]
           [" 2022-01-01T01:00:00.00-07 "     #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01t01:00:00.00-07 "     #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01 01:00:00.00-07 "     #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01T01:00:00.00-07:00 "  #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01t01:00:00.00-07:00 "  #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01 01:00:00.00-07:00 "  #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01T01:00:00.00-07:00 "  #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01t01:00:00.00-07:00 "  #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01 01:00:00.00-07:00 "  #t "2022-01-01T01:00-07:00" offset-dt-type]
           [" 2022-01-01T01:00:00.00Z "       (t/offset-date-time "2022-01-01T01:00+00:00") offset-dt-type]
           [" 2022-01-01t01:00:00.00Z "       (t/offset-date-time "2022-01-01T01:00+00:00") offset-dt-type]
           [" 2022-01-01 01:00:00.00Z "       (t/offset-date-time "2022-01-01T01:00+00:00") offset-dt-type]]]
    (let [settings   {:number-separators (or seps ".,")}
          value-type (#'upload/value->type string-value settings)
          ;; get the type of the column, if it were filled with only that value
          col-type   (first (upload/column-types-from-rows settings 1 [[string-value]]))
          parser     (upload-parsing/upload-type->parser col-type settings)]
      (testing (format "\"%s\" is a %s" string-value type)
        (is (= expected-type
               value-type)))
      (testing (format "\"%s\" is parsed into %s" string-value expected-value)
        (is (= expected-value
               (parser string-value)))))))

(deftest ^:parallel type-coalescing-test
  (doseq [[type-a            type-b           expected]
          [[bool-type        bool-type        bool-type]
           [bool-type        int-type         vchar-type]
           [bool-type        bool-or-int-type bool-type]
           [bool-type        date-type        vchar-type]
           [bool-type        datetime-type    vchar-type]
           [bool-type        vchar-type       vchar-type]
           [bool-type        text-type        text-type]
           [int-type         bool-type        vchar-type]
           [int-type         float-type       float-type]
           [int-type         date-type        vchar-type]
           [int-type         datetime-type    vchar-type]
           [int-type         vchar-type       vchar-type]
           [int-type         text-type        text-type]
           [int-type         bool-or-int-type int-type]
           [bool-or-int-type bool-or-int-type bool-or-int-type]
           [float-type       vchar-type       vchar-type]
           [float-type       text-type        text-type]
           [float-type       date-type        vchar-type]
           [float-type       datetime-type    vchar-type]
           [date-type        datetime-type    datetime-type]
           [date-type        vchar-type       vchar-type]
           [date-type        text-type        text-type]
           [datetime-type    vchar-type       vchar-type]
           [offset-dt-type   vchar-type       vchar-type]
           [datetime-type    text-type        text-type]
           [offset-dt-type   text-type        text-type]
           [vchar-type       text-type        text-type]]]
    (is (= expected (#'upload/lowest-common-ancestor type-a type-b))
        (format "%s + %s = %s" (name type-a) (name type-b) (name expected)))))

(defn csv-file-with
  "Create a temp csv file with the given content and return the file"
  ([rows]
   (csv-file-with rows "test"))
  ([rows file-prefix]
   (csv-file-with rows file-prefix io/writer))
  ([rows file-prefix writer-fn]
   (let [contents (str/join "\n" rows)
         csv-file (doto (File/createTempFile file-prefix ".csv")
                    (.deleteOnExit))]
     (with-open [^java.io.Writer w (writer-fn csv-file)]
       (.write w contents))
     csv-file)))

(defn- detect-schema-with-csv-rows
  "Calls detect-schema on rows from a CSV file. `rows` is a vector of strings"
  [rows]
  (with-open [reader (io/reader (csv-file-with rows))]
    (let [[header & rows] (csv/read-csv reader)]
      (#'upload/detect-schema header rows))))

(deftest ^:parallel detect-schema-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Well-formed CSV file"
      (is (=? {:name             vchar-type
               :age              int-type
               :favorite_pokemon vchar-type}
              (detect-schema-with-csv-rows
               ["Name, Age, Favorite Pokémon"
                "Tim, 12, Haunter"
                "Ryan, 97, Paras"]))))
    (testing "CSV missing data"
      (is (=? {:name       vchar-type
               :height     int-type
               :birth_year float-type}
              (detect-schema-with-csv-rows
               ["Name, Height, Birth Year"
                "Luke Skywalker, 172, -19"
                "Darth Vader, 202, -41.9"
                "Watto, 137"          ; missing column
                "Sebulba, 112,"])))) ; comma, but blank column
    (testing "Type coalescing"
      (is (=? {:name       vchar-type
               :height     float-type
               :birth_year vchar-type}
              (detect-schema-with-csv-rows
               ["Name, Height, Birth Year"
                "Rey Skywalker, 170, 15"
                "Darth Vader, 202.0, 41.9BBY"]))))
    (testing "Boolean coalescing"
      (is (=? {:name                    vchar-type
               :is_jedi_                bool-type
               :is_jedi__int_and_bools_ vchar-type
               :is_jedi__vc_            vchar-type}
              (detect-schema-with-csv-rows
               ["         Name, Is Jedi?, Is Jedi (int and bools), Is Jedi (VC)"
                "Rey Skywalker,      yes,                    true,            t"
                "  Darth Vader,      YES,                    TRUE,            Y"
                "        Grogu,        1,                    9001,    probably?"
                "     Han Solo,       no,                   FaLsE,            0"]))))
    (testing "Boolean and integers together"
      (is (=? {:vchar       vchar-type
               :bool        bool-type
               :bool_or_int bool-type
               :int         int-type}
              (detect-schema-with-csv-rows
               ["vchar,bool,bool-or-int,int"
                " true,true,          1,  1"
                "    1,   1,          0,  0"
                "    2,   0,          0,  0"
                "   no,  no,          1,  2"]))))
    (testing "Order is ensured"
      (let [header "a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,zz,yy,xx,ww,vv,uu,tt,ss,rr,qq,pp,oo,nn,mm,ll,kk,jj,ii,hh,gg,ff,ee,dd,cc,bb,aa"]
        (is (= (map keyword (str/split header #","))
               (keys
                (detect-schema-with-csv-rows
                 [header
                  "Luke,ah'm,yer,da,,,missing,columns,should,not,matter"]))))))
    (testing "Empty contents (with header) are okay"
      (is (=? {:name     text-type
               :is_jedi_ text-type}
              (detect-schema-with-csv-rows
               ["Name, Is Jedi?"]))))
    (testing "Completely empty contents are okay"
      (is (=? {}
              (detect-schema-with-csv-rows
               [""]))))
    (testing "CSV missing data in the top row"
      (is (=? {:name       vchar-type
               :height     int-type
               :birth_year float-type}
              (detect-schema-with-csv-rows
               ["Name, Height, Birth Year"
                ;; missing column
                "Watto, 137"
                "Luke Skywalker, 172, -19"
                "Darth Vader, 202, -41.9"
                ;; comma, but blank column
                "Sebulba, 112,"]))))))

(deftest ^:parallel detect-schema-dates-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Dates"
      (is (=? {:date         date-type
               :not_date     vchar-type
               :datetime     datetime-type
               :not_datetime vchar-type}
              (detect-schema-with-csv-rows
               ["Date      ,Not Date  ,Datetime           ,Not datetime       "
                "2022-01-01,2023-02-28,2022-01-01T00:00:00,2023-02-28T00:00:00"
                "2022-02-01,2023-02-29,2022-01-01T00:00:00,2023-02-29T00:00:00"]))))))

(deftest ^:parallel detect-schema-offset-datetimes-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Dates"
      (is (=? {:offset_datetime offset-dt-type
               :not_datetime   vchar-type}
              (detect-schema-with-csv-rows
               ["Offset Datetime,Not Datetime"
                "2022-01-01T00:00:00-01:00,2023-02-28T00:00:00-01:00"
                "2022-01-01T00:00:00-01:00,2023-02-29T00:00:00-01:00"
                "2022-01-01T00:00:00Z,2023-02-29T00:00:00-01:00"]))))))

(deftest ^:parallel unique-table-name-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "File name is slugified"
      (is (=? #"my_file_name_\d+" (@#'upload/unique-table-name driver/*driver* "my file name"))))
    (testing "semicolons are removed"
      (is (nil? (re-find #";" (@#'upload/unique-table-name driver/*driver* "some text; -- DROP TABLE.csv")))))
    (testing "No collisions"
      (let [n 50
            names (repeatedly n (partial #'upload/unique-table-name driver/*driver* ""))]
        (is (= 50 (count (distinct names))))))))

(defn upload-example-csv!
  "Upload a small CSV file to the given collection ID. `grant-permission?` controls whether the
  current user is granted data permissions to the database."
  [& {:keys [table-prefix collection-id grant-permission? uploads-enabled user-id db-id sync-synchronously? csv-file-prefix]
      :or {collection-id       nil ;; root collection
           grant-permission?   true
           uploads-enabled     true
           user-id             (mt/user->id :rasta)
           db-id               (mt/id)
           sync-synchronously? true
           ;; Make the file-name unique so the table names don't collide on cloud databases like redshift, where we use
           ;; the same schema between test runs
           csv-file-prefix     (str "example csv file " (random-uuid))}
      :as args}]
  (mt/with-temporary-setting-values [uploads-enabled uploads-enabled]
    (mt/with-current-user user-id
      (let [db                (t2/select-one :model/Database db-id)
            schema-name       (if (contains? args :schema-name)
                                (:schema-name args)
                                (sql.tx/session-schema driver/*driver*))
            file              (csv-file-with
                               ["id, name"
                                "1, Luke Skywalker"
                                "2, Darth Vader"]
                               csv-file-prefix)
            group-id          (u/the-id (perms-group/all-users))
            grant?            (and db
                                   (not (mi/can-read? db))
                                   grant-permission?)]
        (when grant?
          (perms/grant-permissions! group-id (perms/data-perms-path db-id)))
        (u/prog1 (binding [upload/*sync-synchronously?* sync-synchronously?]
                   (upload/create-csv-upload! {:collection-id collection-id
                                               :filename      csv-file-prefix
                                               :file          file
                                               :db-id         db-id
                                               :schema-name   schema-name
                                               :table-prefix  table-prefix}))
          (when grant?
            (perms/revoke-data-perms! group-id db-id)))))))

(defn do-with-uploads-allowed
  "Set uploads-enabled to true, and uses an admin user, run the thunk"
  [thunk]
  (mt/with-temporary-setting-values [uploads-enabled true]
    (mt/with-current-user (mt/user->id :crowberto)
      (thunk))))

(defmacro with-uploads-allowed [& body]
  `(do-with-uploads-allowed (fn [] ~@body)))

(defn do-with-upload-table! [table thunk]
  (try (thunk table)
       (finally
         (when (not= driver/*driver* :redshift) ; don't drop redshift tables until the end of the session because they cause flakes
           (driver/drop-table! driver/*driver*
                               (:db_id table)
                               (#'upload/table-identifier table))))))

(defn- table->card [table]
  (t2/select-one :model/Card :table_id (:id table)))

(defn- card->table [card]
  (t2/select-one :model/Table (:table_id card)))

(defmacro with-upload-table!
  "Execute `body` with a table created by evaluating the expression `create-table-expr`. `create-table-expr` must evaluate
  to a toucan Table instance. The instance is bound to `table-sym` in `body`. The table is cleaned up from both the test
  and app DB after the body executes.

    (with-upload-table [table (create-upload-table! ...)]
      ...)"
  {:style/indent 1}
  [[table-binding create-table-expr] & body]
  `(with-uploads-allowed
     (mt/with-model-cleanup [:model/Table]
       (do-with-upload-table! ~create-table-expr (fn [~table-binding] ~@body)))))

(deftest load-from-csv-table-name-test
  (testing "Can upload two files with the same name"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (let [csv-file-prefix "some file prefix"]
        (with-upload-table!
          [table-1 (card->table (upload-example-csv! :csv-file-prefix csv-file-prefix))]
          (with-upload-table!
            [table-2 (card->table (upload-example-csv! :csv-file-prefix csv-file-prefix))]
            (mt/with-current-user (mt/user->id :crowberto)
              (testing "tables are different between the two uploads"
                (is (some? (:id table-1)))
                (is (some? (:id table-2)))
                (is (not= (:id table-1)
                          (:id table-2)))))))))))

(defn- query [db-id source-table]
  (qp/process-query {:database db-id
                     :type     :query
                     :query    {:source-table source-table}}))

(defn- query-table [table]
  (query (:db_id table) (:id table)))

(defn- column-names-for-table
  [table]
  (->> (query-table table)
       mt/cols
       (map (comp u/lower-case-en :name))))

(defn- rows-for-table
  [table]
  (mt/rows (query-table table)))

(defn- rows-for-model
  [db-id model-id]
  (mt/rows (query db-id (str "card__" model-id))))

(defn load-from-csv-and-sync!
  "Creates a table from the csv file using `load-from-csv!` in the session schema, if there is one. Returns a Table instance."
  [driver db table-name file]
  (let [table-name        (ddl.i/format-name driver/*driver* table-name)
        schema            (sql.tx/session-schema driver/*driver*)
        schema+table-name (#'upload/table-identifier {:schema schema :name table-name})]
    (@#'upload/load-from-csv! driver db schema+table-name file)
    (sync-upload-test-table! :database db :table-name table-name :schema-name schema)))

(defn- columns-with-auto-pk [columns]
  (cond-> columns
    (driver.u/supports? driver/*driver* :upload-with-auto-pk (mt/db))
    (#'upload/columns-with-auto-pk)))

(defn- header-with-auto-pk [header]
  (cond->> header
    (driver.u/supports? driver/*driver* :upload-with-auto-pk (mt/db))
    (cons @#'upload/auto-pk-column-name)))

(defn- rows-with-auto-pk [rows]
  (cond->> rows
    (driver.u/supports? driver/*driver* :upload-with-auto-pk (mt/db))
    (map-indexed (fn [i row] (cons (inc i) row)))))

(defn- column-position [table column-name]
  (t2/select-one-fn :database_position Field :%lower.name (u/lower-case-en column-name) :table_id (:id table)))

(deftest load-from-csv-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["id    ,nulls,string ,bool ,number       ,date      ,datetime"
                                    "2\t   ,,          a ,true ,1.1\t        ,2022-01-01,2022-01-01T00:00:00"
                                    "\" 3\",,           b,false,\"$ 1,000.1\",2022-02-01,2022-02-01T00:00:00"])))]
          (testing "Table and Fields exist after sync"
            (is (=? (cond->> [["id" {:semantic_type :type/PK
                                     :base_type     :type/BigInteger}]
                              ["nulls" {:base_type :type/Text}]
                              ["string" {:base_type :type/Text}]
                              ["bool" {:base_type :type/Boolean}]
                              ["number" {:base_type :type/Float}]
                              ["date" {:base_type :type/Date}]
                              ["datetime" {:base_type :type/DateTime}]]
                      (driver.u/supports? driver/*driver* :upload-with-auto-pk (mt/db))
                      (cons ["_mb_row_id" {:semantic_type     :type/PK
                                           :base_type         :type/BigInteger}]))
                    (->> (t2/select :model/Field :table_id (:id table))
                         (sort-by :database_position)
                         (map (juxt (comp u/lower-case-en :name) identity))))))
          (testing "Check the data was uploaded into the table"
            (is (= 2
                   (count (rows-for-table table))))))))))

(deftest load-from-csv-date-test
  (testing "Upload a CSV file with a datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["datetime"
                                    "2022-01-01"
                                    "2022-01-01 00:00"
                                    "2022-01-01T00:00:00"
                                    "2022-01-01T00:00"])))]
          (testing "Fields exists after sync"
            (testing "Check the datetime column the correct base_type"
              (is (=? :type/DateTime
                      (t2/select-one-fn :base_type Field :%lower.name "datetime" :table_id (:id table)))))
            (is (some? table))))))))

(deftest load-from-csv-offset-datetime-test
  (testing "Upload a CSV file with an offset datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-redefs [driver/db-default-timezone (constantly "Z")
                      upload/current-database    (constantly (mt/db))]
          (let [table-name (mt/random-name)
                transpose  (fn [m] (apply mapv vector m))
                [csv-strs expected] (transpose [["2022-01-01T12:00:00-07"    "2022-01-01T19:00:00Z"]
                                                ["2022-01-01T12:00:00-07:00" "2022-01-01T19:00:00Z"]
                                                ["2022-01-01T12:00:00-07:30" "2022-01-01T19:30:00Z"]
                                                ["2022-01-01T12:00:00Z"      "2022-01-01T12:00:00Z"]
                                                ["2022-01-01T12:00:00-00:00" "2022-01-01T12:00:00Z"]
                                                ["2022-01-01T12:00:00+07"    "2022-01-01T05:00:00Z"]
                                                ["2022-01-01T12:00:00+07:00" "2022-01-01T05:00:00Z"]
                                                ["2022-01-01T12:00:00+07:30" "2022-01-01T04:30:00Z"]])]
            (testing "Fields exists after sync"
              (with-upload-table!
                [table (do (load-from-csv-and-sync!
                            driver/*driver*
                            (mt/db)
                            table-name
                            (csv-file-with (into ["offset_datetime"] csv-strs))))]
                (testing "Check the offset datetime column the correct base_type"
                  (is (=? :type/DateTimeWithLocalTZ
                          (t2/select-one-fn :base_type Field :%lower.name "offset_datetime" :table_id (:id table)))))
                (let [position (column-position table "offset_datetime")
                      values   (map #(nth % position) (rows-for-table table))]
                  (is (= expected
                         values)))))))))))

(deftest load-from-csv-boolean-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["id,bool"
                                    "1,true"
                                    "2,false"
                                    "3,TRUE"
                                    "4,FALSE"
                                    "5,t    "
                                    "6,   f"
                                    "7,\tT"
                                    "8,F\t"
                                    "9,y"
                                    "10,n"
                                    "11,Y"
                                    "12,N"
                                    "13,yes"
                                    "14,no"
                                    "15,YES"
                                    "16,NO"
                                    "17,1"
                                    "18,0"])))]
          (testing "Table and Fields exist after sync"
            (testing "Check the boolean column has a boolean base_type"
              (is (= :type/Boolean
                     (t2/select-one-fn :base_type Field :%lower.name "bool" :table_id (:id table)))))
            (testing "Check the data was uploaded into the table correctly"
              (let [position    (column-position table "bool")
                    bool-column (map #(nth % position) (rows-for-table table))
                    alternating (map even? (range (count bool-column)))]
                (is (= alternating bool-column))))))))))

(deftest load-from-csv-length-test
  (testing "Upload a CSV file with large names and numbers"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (let [length-limit (driver/table-name-length-limit driver/*driver*)
            ;; Ensure the name is unique as table names can collide when using redshift
            long-name    (->> "abc" str cycle (take (inc length-limit)) shuffle (apply str))
            short-name   (subs long-name 0 (- length-limit (count "_yyyyMMddHHmmss")))
            table-name   (u/upper-case-en (@#'upload/unique-table-name driver/*driver* long-name))]
        (is (pos? length-limit) "driver/table-name-length-limit has been set")
        (with-mysql-local-infile-on-and-off
          (with-upload-table!
            [table (do (load-from-csv-and-sync!
                        driver/*driver*
                        (mt/db)
                        table-name
                        (csv-file-with ["number,bool"
                                        "1,true"
                                        "2,false"
                                        (format "%d,true" Long/MAX_VALUE)])))]
            (let [table-re (re-pattern (str "(?i)" short-name "_\\d{14}"))]
              (testing "It truncates it to the right number of characters, allowing for the timestamp"
                (is (re-matches table-re (:name table))))
              (testing "Check the data was uploaded into the table correctly"
                (is (= (rows-with-auto-pk
                        [[1 true]
                         [2 false]
                         [Long/MAX_VALUE true]])
                       (rows-for-table table)))))))))))

(deftest load-from-csv-empty-header-test
  (testing "Upload a CSV file with a blank column name"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-upload-table!
        [table (let [table-name (mt/random-name)]
                 (load-from-csv-and-sync!
                  driver/*driver*
                  (mt/db)
                  table-name
                  (csv-file-with [",ship name,"
                                  "1,Serenity,Malcolm Reynolds"
                                  "2,Millennium Falcon, Han Solo"])))]
        (testing "Check the data was uploaded into the table correctly"
          (is (= (header-with-auto-pk ["unnamed_column" "ship_name" "unnamed_column_2"])
                 (column-names-for-table table))))))))

(deftest load-from-csv-duplicate-names-test
  (testing "Upload a CSV file with duplicate column names"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["unknown,unknown,unknown,unknown_2"
                                    "1,Serenity,Malcolm Reynolds,Pistol"
                                    "2,Millennium Falcon, Han Solo,Blaster"])))]
          (testing "Table and Fields exist after sync"
            (testing "Check the data was uploaded into the table correctly"
              (is (= (header-with-auto-pk ["unknown" "unknown_2" "unknown_3" "unknown_2_2"])
                     (column-names-for-table table))))))))))

(deftest load-from-csv-bool-and-int-test
  (testing "Upload a CSV file with integers and booleans in the same column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["vchar,bool,bool-or-int,int"
                                    " true,true,          1,  1"
                                    "    1,   1,          0,  0"
                                    "    2,   0,          0,  0"
                                    "   no,  no,          1,  2"])))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (rows-with-auto-pk
                    [[" true"  true true  1]
                     ["    1"  true false 0]
                     ["    2" false false 0]
                     ["   no" false true  2]])
                   (rows-for-table table)))))))))

(deftest load-from-csv-auto-pk-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :upload-with-auto-pk)
    (with-mysql-local-infile-on-and-off
      (testing "Upload a CSV file with column names that are reserved by the DB, ignoring them"
        (testing "A single column whose name normalizes to _mb_row_id"
          (with-upload-table!
            [table (let [table-name (mt/random-name)]
                     (load-from-csv-and-sync!
                      driver/*driver*
                      (mt/db)
                      table-name
                      (csv-file-with ["_mb_ROW-id,ship,captain"
                                      "100,Serenity,Malcolm Reynolds"
                                      "3,Millennium Falcon, Han Solo"])))]
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["_mb_row_id", "ship", "captain"]
                     (column-names-for-table table)))
              (is (= (rows-with-auto-pk
                      [["Serenity" "Malcolm Reynolds"]
                       ["Millennium Falcon" " Han Solo"]])
                     (rows-for-table table)))))))
      (testing "Multiple identical column names that normalize to _mb_row_id"
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["_mb row id,ship,captain,_mb row id"
                                    "100,Serenity,Malcolm Reynolds,200"
                                    "3,Millennium Falcon, Han Solo,4"])))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= ["_mb_row_id", "ship", "captain"]
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [["Serenity" "Malcolm Reynolds"]
                     ["Millennium Falcon" " Han Solo"]])
                   (rows-for-table table))))))
      (testing "Multiple different column names that normalize to _mb_row_id"
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["_mb row id,ship,captain,_MB_ROW_ID"
                                    "100,Serenity,Malcolm Reynolds,200"
                                    "3,Millennium Falcon, Han Solo,4"])))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= ["_mb_row_id", "ship", "captain"]
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [["Serenity" "Malcolm Reynolds"]
                     ["Millennium Falcon" " Han Solo"]])
                   (rows-for-table table)))))))))

(deftest load-from-csv-auto-pk-column-non-supporting-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    ;; There aren't any officially supported databases yet that don't support `:upload-with-auto-pk`
    ;; So we'll fake it here to test it for 3rd party drivers
    (let [original-database-supports?-fn driver.u/supports?]
      (with-redefs [driver.u/supports? (fn [driver feature db]
                                         (if (= feature :upload-with-auto-pk)
                                           false
                                           (original-database-supports?-fn driver feature db)))]
        (with-mysql-local-infile-on-and-off
          (testing "Upload a CSV file with column names that are reserved by the DB, NOT ignoring them"
            (testing "A single column whose name normalizes to _mb_row_id"
              (with-upload-table!
                [table (let [table-name (mt/random-name)]
                         (load-from-csv-and-sync!
                          driver/*driver*
                          (mt/db)
                          table-name
                          (csv-file-with ["_mb_ROW-id,ship,captain"
                                          "100,Serenity,Malcolm Reynolds"
                                          "3,Millennium Falcon, Han Solo"])))]
                (testing "Check the data was uploaded into the table correctly"
                  (is (= ["_mb_row_id", "ship", "captain"]
                         (column-names-for-table table)))
                  (is (= (rows-with-auto-pk
                          [[100 "Serenity" "Malcolm Reynolds"]
                           [3   "Millennium Falcon" " Han Solo"]])
                         (rows-for-table table)))))))
          (testing "Multiple identical column names that normalize to _mb_row_id"
            (with-upload-table!
              [table (let [table-name (mt/random-name)]
                       (load-from-csv-and-sync!
                        driver/*driver*
                        (mt/db)
                        table-name
                        (csv-file-with ["_mb row id,ship,captain,_mb row id"
                                        "100,Serenity,Malcolm Reynolds,200"
                                        "3,Millennium Falcon, Han Solo,4"])))]
              (testing "Check the data was uploaded into the table correctly"
                (is (= ["_mb_row_id", "ship", "captain" "_mb_row_id_2"]
                       (column-names-for-table table)))
                (is (= (rows-with-auto-pk
                        [[100 "Serenity"          "Malcolm Reynolds" 200]
                         [3   "Millennium Falcon" " Han Solo"        4]])
                       (rows-for-table table))))))
          (testing "Multiple different column names that normalize to _mb_row_id"
            (with-upload-table!
              [table (let [table-name (mt/random-name)]
                       (load-from-csv-and-sync!
                        driver/*driver*
                        (mt/db)
                        table-name
                        (csv-file-with ["_mb row id,ship,captain,_MB_ROW_ID"
                                        "100,Serenity,Malcolm Reynolds,200"
                                        "3,Millennium Falcon, Han Solo,4"])))]
              (testing "Check the data was uploaded into the table correctly"
                (is (= ["_mb_row_id", "ship", "captain" "_mb_row_id_2"]
                       (column-names-for-table table)))
                (is (= (rows-with-auto-pk
                        [[100 "Serenity" "Malcolm Reynolds" 200]
                         [3 "Millennium Falcon" " Han Solo" 4]])
                       (rows-for-table table)))))))))))

(deftest load-from-csv-missing-values-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (testing "Can upload a CSV with missing values"
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["column_that_has_one_value,column_that_doesnt_have_a_value"
                                    "2"
                                    "  ,\n"])))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["column_that_has_one_value", "column_that_doesnt_have_a_value"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [[2 nil]
                     [nil nil]])
                   (rows-for-table table)))))))))

(deftest load-from-csv-tab-test
  (testing "Upload a CSV file with tabs in the values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["ship,captain"
                                    "Serenity,Malcolm\tReynolds"
                                    "Millennium\tFalcon,Han\tSolo"])))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["ship", "captain"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [["Serenity" "Malcolm\tReynolds"]
                     ["Millennium\tFalcon" "Han\tSolo"]])
                   (rows-for-table table)))))))))

(deftest load-from-csv-carriage-return-test
  (testing "Upload a CSV file with carriage returns in the values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["ship,captain"
                                    "Serenity,\"Malcolm\rReynolds\""
                                    "\"Millennium\rFalcon\",\"Han\rSolo\""])))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["ship", "captain"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [["Serenity" "Malcolm\rReynolds"]
                     ["Millennium\rFalcon" "Han\rSolo"]])
                   (rows-for-table table)))))))))

(deftest load-from-csv-BOM-test
  (testing "Upload a CSV file with a byte-order mark (BOM)"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["ship,captain"
                                    "Serenity,Malcolm Reynolds"
                                    "Millennium Falcon, Han Solo"]
                                   "star-wars"
                                   (partial bom/bom-writer "UTF-8"))))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["ship", "captain"])
                   (column-names-for-table table)))))))))

(deftest load-from-csv-injection-test
  (testing "Upload a CSV file with very rude values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (with-upload-table!
          [table (let [table-name (mt/random-name)]
                   (load-from-csv-and-sync!
                    driver/*driver*
                    (mt/db)
                    table-name
                    (csv-file-with ["id integer); --,ship,captain"
                                    "1,Serenity,--Malcolm Reynolds"
                                    "2,;Millennium Falcon,Han Solo\""]
                                   "\"; -- Very rude filename")))]
          (testing "Check the data was uploaded into the table correctly"
            (is (= (header-with-auto-pk ["id_integer_____" "ship" "captain"])
                   (column-names-for-table table)))
            (is (= (rows-with-auto-pk
                    [[1 "Serenity"           "--Malcolm Reynolds"]
                     [2 ";Millennium Falcon" "Han Solo\""]])
                   (rows-for-table table)))))))))

(deftest load-from-csv-eof-marker-test
  (testing "Upload a CSV file with Postgres's 'end of input' marker"
    (mt/test-drivers [:postgres]
      (with-upload-table!
        [table (let [table-name (mt/random-name)]
                 (load-from-csv-and-sync!
                  driver/*driver*
                  (mt/db)
                  table-name
                  (csv-file-with ["name"
                                  "Malcolm"
                                  "\\."
                                  "Han"])))]
        (testing "Check the data was uploaded into the table correctly"
          (is (= (rows-with-auto-pk
                  [["Malcolm"] ["\\."] ["Han"]])
                 (rows-for-table table))))))))

(deftest mysql-settings-test
  (testing "Ensure that local_infile is set to true for better MySQL testing"
    (mt/test-drivers [:mysql]
      (do-with-mysql-local-infile-on
       (fn []
         (is (= "ON" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                         (jdbc/query "show global variables like 'local_infile'")
                         first
                         :value)))))))
  (testing "Ensure that local_infile is set to false for better MySQL testing"
    (mt/test-drivers [:mysql]
      (do-with-mysql-local-infile-off
       (fn []
         (is (= "OFF" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                          (jdbc/query "show global variables like 'local_infile'")
                          first
                          :value))))))))

(defn append-csv!
  "Wraps [[upload/append-csv!]] setting [[upload/*sync-synchronously?*]] to `true` for test purposes."
  [& args]
  (binding [upload/*sync-synchronously?* true]
    (apply upload/append-csv! args)))

(deftest create-csv-upload!-schema-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :schemas)
    (let [db                   (mt/db)
          db-id                (u/the-id db)
          original-sync-values (select-keys db [:is_on_demand :is_full_sync])
          in-future?           (atom false)
          schema-name          (or (sql.tx/session-schema driver/*driver*) "public")
          _                    (t2/update! :model/Database db-id {:is_on_demand false
                                                                  :is_full_sync false})]
      (try
        (with-redefs [;; do away with the `future` invocation since we don't want race conditions in a test
                      future-call (fn [thunk]
                                    (swap! in-future? (constantly true))
                                    (thunk))]
          (testing "Happy path with schema, and without table-prefix"
            (with-upload-table!
              [new-table (card->table (upload-example-csv! :schema-name schema-name :sync-synchronously? false))]
              (is (=? {:display          :table
                       :database_id      db-id
                       :dataset_query    {:database db-id
                                          :query    {:source-table (:id new-table)}
                                          :type     :query}
                       :creator_id       (mt/user->id :rasta)
                       :name             #"(?i)example csv file(.*)"
                       :collection_id    nil}
                      (t2/select-one :model/Card :table_id (:id new-table)))
                  "A new model is created")
              (is (=? {:name      #"(?i)example(.*)"
                       :schema    (re-pattern (str "(?i)" schema-name))
                       :is_upload true}
                      new-table)
                  "A new table is created")
              (is (= "complete"
                     (:initial_sync_status new-table))
                  "The table is synced and marked as complete")
              (is (t2/exists? Field :table_id (:id new-table) :%lower.name "name" :semantic_type :type/Name)
                  "The sync actually runs")
              (is (true? @in-future?)
                  "Table has been synced in a separate thread"))))
        (finally
          (t2/update! :model/Database db-id original-sync-values))))))

(deftest create-csv-upload!-table-prefix-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Happy path with table prefix, and without schema"
      (if (driver.u/supports? driver/*driver* :schemas (mt/db))
        (is (thrown-with-msg?
              java.lang.Exception
              #"^A schema has not been set."
              (upload-example-csv! :table-prefix "uploaded_magic_" :schema-name nil)))
        (with-upload-table! [table (card->table (upload-example-csv! :table-prefix "uploaded_magic_"))]
          (is (=? {:name #"(?i)example csv file(.*)"}
                  (table->card table)))
          (is (=? {:name #"(?i)uploaded_magic_example(.*)"}
                  table))
          (is (nil? (:schema table))))))))

(deftest create-csv-upload!-auto-pk-column-display-name-test
  (testing "The auto-generated column display_name should be the same as its name"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads :upload-with-auto-pk)
      (with-upload-table! [table (card->table (upload-example-csv!))]
        (let [new-field (t2/select-one Field :table_id (:id table) :name "_mb_row_id")]
          (is (= "_mb_row_id"
                 (:name new-field)
                 (:display_name new-field))))))))

(deftest csv-upload-snowplow-test
  ;; Just test with h2 because snowplow should be independent of the driver
  (mt/test-driver :h2
    (snowplow-test/with-fake-snowplow-collector
      (with-upload-table!
        [_table (card->table (upload-example-csv!))]
        (is (=? {:data {"model_id"        pos?
                        "size_mb"         3.910064697265625E-5
                        "num_columns"     2
                        "num_rows"        2
                        "upload_seconds"  pos?
                        "event"           "csv_upload_successful"}
                 :user-id (str (mt/user->id :rasta))}
                (last (snowplow-test/pop-event-data-and-user-id!))))
        (with-redefs [upload/load-from-csv! (fn [_ _ _ _]
                                              (throw (Exception.)))]
          (try (upload-example-csv!)
               (catch Throwable _
                 nil))
          (is (= {:data {"size_mb"     3.910064697265625E-5
                         "num_columns" 2
                         "num_rows"    2
                         "event"       "csv_upload_failed"}
                  :user-id (str (mt/user->id :rasta))}
                 (last (snowplow-test/pop-event-data-and-user-id!)))))))))

(deftest create-csv-upload!-failure-test
  ;; Just test with postgres because failure should be independent of the driver
  (mt/test-driver :postgres
    (mt/with-empty-db
      (testing "Uploads must be enabled"
        (doseq [uploads-enabled-value [false nil]]
          (is (thrown-with-msg?
                java.lang.Exception
                #"^Uploads are not enabled\.$"
                (upload-example-csv! :uploads-enabled uploads-enabled-value :schema-name "public", :table-prefix "uploaded_magic_")))))
      (testing "Database ID must be valid"
        (is (thrown-with-msg?
              java.lang.Exception
              #"^The uploads database does not exist\.$"
              (upload-example-csv! :db-id Integer/MAX_VALUE, :schema-name "public", :table-prefix "uploaded_magic_"))))
      (testing "Uploads must be supported"
        (with-redefs [driver.u/supports? (constantly false)]
          (is (thrown-with-msg?
                java.lang.Exception
                #"^Uploads are not supported on Postgres databases\."
                (upload-example-csv! :schema-name "public", :table-prefix "uploaded_magic_")))))
      (testing "User must have write permissions on the collection"
        (mt/with-non-admin-groups-no-root-collection-perms
          (is (thrown-with-msg?
                java.lang.Exception
                #"^You do not have curate permissions for this Collection\.$"
                (upload-example-csv! :user-id (mt/user->id :lucky) :schema-name "public", :table-prefix "uploaded_magic_"))))))))

(defn- find-schema-filters-prop [driver]
  (first (filter (fn [conn-prop]
                   (= :schema-filters (keyword (:type conn-prop))))
                 (driver/connection-properties driver))))

(deftest create-csv-upload!-schema-does-not-sync-test
  ;; Just test with postgres because failure should be independent of the driver
  (mt/test-driver :postgres
    (mt/with-empty-db
      (let [driver             (driver.u/database->driver (mt/db))
            schema-filter-prop (find-schema-filters-prop driver)
            filter-type-prop   (keyword (str (:name schema-filter-prop) "-type"))
            patterns-type-prop (keyword (str (:name schema-filter-prop) "-patterns"))]
        (t2/update! :model/Database (mt/id) {:details (-> (mt/db)
                                                          :details
                                                          (assoc filter-type-prop "exclusion"
                                                                 patterns-type-prop "public"))})
        (testing "Upload should fail if table can't be found after sync, for example because of schema filters"
          (try (upload-example-csv! {:schema-name "public"})
               (catch Exception e
                 (is (= {:status-code 422}
                        (ex-data e)))
                 (is (re-matches #"^The schema public is not syncable\.$"
                                 (.getMessage e))))))
        (testing "\nThe table should be deleted"
          (is (false? (let [details (mt/dbdef->connection-details driver/*driver* :db {:database-name (:name (mt/db))})]
                        (-> (jdbc/query (sql-jdbc.conn/connection-details->spec driver/*driver* details)
                                        ["SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public')"])
                            first :exists)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           append-csv!                                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn create-upload-table!
  "Creates a table and syncs it in the current test database, as if it were uploaded as a CSV upload.
  `col->upload-type` should be an ordered map of column names (keywords) to upload types.
  `rows` should be a vector of vectors of values, one for each row.
  Returns the table.

  Defaults to a table with an auto-incrementing integer ID column, and a name column."
  [& {:keys [schema-name table-name col->upload-type rows]
      :or {table-name       (ddl.i/format-name driver/*driver* (mt/random-name))
           schema-name      (sql.tx/session-schema driver/*driver*)
           col->upload-type (cond->> (ordered-map/ordered-map :name ::upload/varchar-255)
                              (#'upload/create-auto-pk-column? driver/*driver* (mt/db))
                              (merge (ordered-map/ordered-map
                                      upload/auto-pk-column-keyword ::upload/auto-incrementing-int-pk)))
           rows             [["Obi-Wan Kenobi"]]}}]
  (let [driver driver/*driver*
        db-id (mt/id)
        schema+table-name (#'upload/table-identifier {:schema schema-name :name table-name})
        insert-col-names (remove #{upload/auto-pk-column-keyword} (keys col->upload-type))
        col-definitions (#'upload/column-definitions driver col->upload-type)
        _ (driver/create-table! driver/*driver*
                                db-id
                                schema+table-name
                                col-definitions
                                (if (contains? col-definitions upload/auto-pk-column-keyword)
                                  {:primary-key [upload/auto-pk-column-keyword]}
                                  {}))
        _ (driver/insert-into! driver db-id schema+table-name insert-col-names rows)]
    (sync-upload-test-table! :database (mt/db) :table-name table-name :schema-name schema-name)))

(defmacro maybe-apply-macro
  [flag macro-fn & body]
  `(if ~flag
     (~macro-fn ~@body)
     ~@body))

(defn append-csv-with-defaults!
  "Upload a small CSV file to a newly created default table, or an existing table if `table-id` is provided. Default args can be overridden."
  [& {:keys [uploads-enabled user-id file table-id is-upload]
      :or {uploads-enabled true
           user-id         (mt/user->id :crowberto)
           file            (csv-file-with
                            ["name"
                             "Luke Skywalker"
                             "Darth Vader"]
                            (mt/random-name))
           is-upload       true}}]
  (mt/with-temporary-setting-values [uploads-enabled uploads-enabled]
    (mt/with-current-user user-id
      (mt/with-model-cleanup [:model/Table]
        (let [new-table (when (nil? table-id)
                          (create-upload-table!))
              table-id (or table-id (:id new-table))]
          (t2/update! :model/Table table-id {:is_upload is-upload})
          (try (append-csv! {:table-id table-id
                             :file     file})
               (finally
                 ;; Drop the table in the testdb if a new one was created.
                 (when (and new-table (not= driver/*driver* :redshift)) ; don't drop redshift tables until the end of the session because they cause flakes
                   (driver/drop-table! driver/*driver*
                                       (mt/id)
                                       (#'upload/table-identifier new-table))))))))))

(defn catch-ex-info* [f]
  (try
    (f)
    (catch Exception e
      {:message (ex-message e) :data (ex-data e)})))

(defmacro catch-ex-info
  [& body]
  `(catch-ex-info* (fn [] ~@body)))

(deftest can-append-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Happy path"
      (is (= {:row-count 2}
             (append-csv-with-defaults!))))
    (testing "Even if the uploads database, schema and table prefix are not set, appends succeed"
      (mt/with-temporary-setting-values [uploads-database-id nil
                                         uploads-schema-name nil
                                         uploads-table-prefix nil]
        (is (some? (append-csv-with-defaults!)))))
    (testing "Uploads must be enabled"
      (is (= {:message "Uploads are not enabled."
              :data    {:status-code 422}}
             (catch-ex-info (append-csv-with-defaults! :uploads-enabled false)))))
    (testing "The table must exist"
      (is (= {:message "Not found."
              :data    {:status-code 404}}
             (catch-ex-info (append-csv-with-defaults! :table-id Integer/MAX_VALUE)))))
    (testing "The table must be an uploaded table"
      (is (= {:message "The table must be an uploaded table."
              :data    {:status-code 422}}
             (catch-ex-info (append-csv-with-defaults! :is-upload false)))))
    (testing "The CSV file must not be empty"
      (is (= {:message "The CSV file is missing columns that are in the table:\n- name",
              :data    {:status-code 422}}
             (catch-ex-info (append-csv-with-defaults! :file (csv-file-with [] (mt/random-name)))))))
    (testing "Uploads must be supported"
      (with-redefs [driver.u/supports? (constantly false)]
        (is (= {:message (format "Uploads are not supported on %s databases." (str/capitalize (name driver/*driver*)))
                :data    {:status-code 422}}
               (catch-ex-info (append-csv-with-defaults!))))))))

(deftest append-column-match-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Append should succeed regardless of CSV column order or case"
      (doseq [csv-rows [["id,name" "20,Luke Skywalker" "30,Darth Vader"]
                        ["Id\t,NAmE " "20,Luke Skywalker" "30,Darth Vader"] ;; the same name when normalized
                        ["name,id" "Luke Skywalker,20" "Darth Vader,30"]]]  ;; different order
        (with-upload-table!
          [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                           (ordered-map/ordered-map
                                                            :id ::upload/int
                                                            :name ::upload/varchar-255))
                                        :rows             [[10 "Obi-Wan Kenobi"]]})]
          (let [file (csv-file-with csv-rows (mt/random-name))]
            (is (some? (append-csv! {:file     file
                                     :table-id (:id table)})))
            (testing "Check the data was uploaded into the table correctly"
              (is (= (set (rows-with-auto-pk
                           [[10 "Obi-Wan Kenobi"]
                            [20 "Luke Skywalker"]
                            [30 "Darth Vader"]]))
                     (set (rows-for-table table)))))
            (io/delete-file file)))))))

(defn- trim-lines [s]
  (->> (str/split-lines s)
       (map str/trim)
       (str/join "\n")))

(deftest append-column-mismatch-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-uploads-allowed
      (testing "Append should fail if there are extra or missing columns in the CSV file"
        (doseq [[csv-rows error-message]
                {["_mb_row_id,id,name,extra column one,EXTRA COLUMN TWO"]
                 (if (driver.u/supports? driver/*driver* :upload-with-auto-pk (mt/db))
                   (trim-lines "The CSV file contains extra columns that are not in the table:
                                - extra_column_two
                                - extra_column_one")
                   (trim-lines "The CSV file contains extra columns that are not in the table:
                                - _mb_row_id
                                - extra_column_two
                                - extra_column_one"))

                 [""]
                 (trim-lines "The CSV file is missing columns that are in the table:
                              - id
                              - name")

                 ["extra 1, extra 2"]
                 (trim-lines "The CSV file contains extra columns that are not in the table:
                              - extra_2
                              - extra_1

                              The CSV file is missing columns that are in the table:
                              - id
                              - name")}]
          (with-upload-table!
            [table (create-upload-table!
                    {:col->upload-type (ordered-map/ordered-map
                                        :id         ::upload/int
                                        :name       ::upload/varchar-255)
                     :rows [[1,"some_text"]]})]
            (let [file  (csv-file-with csv-rows (mt/random-name))]
              (is (= {:message error-message
                      :data {:status-code 422}}
                     (catch-ex-info (append-csv! {:file     file
                                                  :table-id (:id table)}))))
              (testing "Check the data was not uploaded into the table"
                (is (= [[1 "some_text"]]
                       (rows-for-table table))))
              (io/delete-file file))))))))

(deftest append-common-types-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (mt/with-report-timezone-id "UTC"
        (testing "Append should succeed for all possible CSV column types"
          (with-redefs [driver/db-default-timezone (constantly "Z")
                        upload/current-database    (constantly (mt/db))]
            (with-upload-table!
              [table (create-upload-table!
                      {:col->upload-type (columns-with-auto-pk
                                          (ordered-map/ordered-map
                                           :biginteger      ::upload/int
                                           :float           ::upload/float
                                           :text            ::upload/varchar-255
                                           :boolean         ::upload/boolean
                                           :date            ::upload/date
                                           :datetime        ::upload/datetime))
                       :rows [[1000000,1.0,"some_text",false,#t "2020-01-01",#t "2020-01-01T00:00:00"]]})]
              (let [csv-rows ["biginteger,float,text,boolean,date,datetime"
                              "2000000,2.0,some_text,true,2020-02-02,2020-02-02T02:02:02"]
                    file  (csv-file-with csv-rows (mt/random-name))]
                (is (some? (append-csv! {:file     file
                                         :table-id (:id table)})))
                (testing "Check the data was uploaded into the table correctly"
                  (is (= (set (rows-with-auto-pk
                               [[1000000 1.0 "some_text" false "2020-01-01T00:00:00Z" "2020-01-01T00:00:00Z"]
                                [2000000 2.0 "some_text" true "2020-02-02T00:00:00Z" "2020-02-02T02:02:02Z"]]))
                         (set (rows-for-table table)))))
                (io/delete-file file)))))))))

(deftest append-offset-datetime-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (mt/with-report-timezone-id "UTC"
        (testing "Append should succeed for all possible CSV column types"
          (with-redefs [driver/db-default-timezone (constantly "Z")
                        upload/current-database    (constantly (mt/db))]
            (with-upload-table!
              [table (create-upload-table!
                      {:col->upload-type (columns-with-auto-pk
                                          (ordered-map/ordered-map
                                           :offset_datetime ::upload/offset-datetime))
                       :rows []})]
              (let [csv-rows ["offset_datetime"
                              "2020-02-02T02:02:02+02:00"]
                    file  (csv-file-with csv-rows (mt/random-name))]
                (is (some? (append-csv! {:file     file
                                         :table-id (:id table)})))
                (testing "Check the data was uploaded into the table correctly"
                  (is (= (set (rows-with-auto-pk
                               [[(if (driver/upload-type->database-type driver/*driver* ::upload/offset-datetime)
                                   "2020-02-02T00:02:02Z"
                                   "2020-02-02T02:02:02+02:00")]]))
                         (set (rows-for-table table)))))
                (io/delete-file file)))))))))

(defn- cached-model-ids []
  (into #{} (map :card_id) (t2/select [:model/PersistedInfo :card_id] :active true)))

(defn- mbql [mp table]
  (let [table-metadata (lib.metadata/table mp (:id table))]
    (lib.convert/->legacy-MBQL (lib/query mp table-metadata))))

(defn- join-mbql [mp base-table join-table]
  (let [base-table-metadata (lib.metadata/table mp (:id base-table))
        join-table-metadata (lib.metadata/table mp (:id join-table))
        ;; We use the primary keys as the join fields as we know they will exist and have compatible types.
        pk-metadata         (fn [pk-table]
                              (let [field-id (t2/select-one-pk :model/Field
                                                               :table_id (:id pk-table)
                                                               :semantic_type :type/PK)]
                                (lib.metadata/field mp field-id)))
        base-id-metadata    (pk-metadata base-table)
        join-id-metadata    (pk-metadata join-table)]

    (-> (lib/query mp base-table-metadata)
        (lib/join (lib/join-clause join-table-metadata
                                   [(lib/= base-id-metadata
                                           join-id-metadata)]))
        (lib.convert/->legacy-MBQL))))

(deftest append-invalidate-model-cache-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :persist-models)
    (with-upload-table! [table (create-upload-table!)]
      (let [table-id    (:id table)
            csv-rows    ["name" "Luke Skywalker"]
            file        (csv-file-with csv-rows)
            other-id    (mt/id :venues)
            other-table (t2/select-one :model/Table other-id)
            mp          (lib.metadata.jvm/application-database-metadata-provider (:db_id table))]

        (mt/with-temp [:model/Card {question-id        :id} {:table_id table-id, :dataset_query (mbql mp table)}
                       :model/Card {model-id           :id} {:table_id table-id, :type "model", :dataset_query (mbql mp table)}
                       :model/Card {complex-model-id   :id} {:table_id table-id, :type "model", :dataset_query (join-mbql mp table other-table)}
                       :model/Card {archived-model-id  :id} {:table_id table-id, :type "model", :archived true, :dataset_query (mbql mp table)}
                       :model/Card {unrelated-model-id :id} {:table_id other-id, :type "model", :dataset_query (mbql mp other-table)}
                       :model/Card {joined-model-id    :id} {:table_id other-id, :type "model", :dataset_query (join-mbql mp other-table table)}]

          (is (= #{question-id model-id complex-model-id}
                 (into #{} (map :id) (t2/select :model/Card :table_id table-id :archived false))))

          (mt/with-persistence-enabled [persist-models!]
            (persist-models!)

            (let [cached-before (cached-model-ids)
                  _             (append-csv! {:file file, :table-id (:id table)})
                  cached-after  (cached-model-ids)]

              (testing "The models are cached"
                (let [active-model-ids #{model-id complex-model-id unrelated-model-id joined-model-id}]
                  (is (= active-model-ids (set/intersection cached-before (conj active-model-ids archived-model-id))))))
              (testing "The cache is invalidated by the update"
                (is (not (contains? cached-after model-id))))
              (testing "No unwanted caches were invalidated"
                (is (= #{model-id} (set/difference cached-before cached-after))))
              (testing "We can see the new row when querying the model"
                (is (some (fn [[_ row-name]] (= "Luke Skywalker" row-name))
                          (rows-for-model (:db_id table) model-id)))))))

        (io/delete-file file)))))

(deftest append-no-rows-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-uploads-allowed
      (testing "Append should succeed with a CSV with only the header"
        (let [csv-rows ["name"]]
          (with-upload-table!
            [table (create-upload-table!)]
            (let [file (csv-file-with csv-rows (mt/random-name))]
              (is (= {:row-count 0}
                     (append-csv! {:file     file
                                   :table-id (:id table)})))
              (testing "Check the data was not uploaded into the table"
                (is (= (rows-with-auto-pk
                        [["Obi-Wan Kenobi"]])
                       (rows-for-table table))))
              (io/delete-file file))))))))

(deftest append-mb-row-id-csv-only-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :upload-with-auto-pk)
    (testing "If the table doesn't have _mb_row_id but the CSV does, ignore the CSV _mb_row_id but create the column anyway"
      (with-upload-table!
        [table (create-upload-table! {:col->upload-type (ordered-map/ordered-map
                                                         :name ::upload/varchar-255)
                                      :rows             [["Obi-Wan Kenobi"]]})]
        (let [csv-rows ["_MB-row ID,name" "1000,Luke Skywalker"]
              file     (csv-file-with csv-rows (mt/random-name))]
          (is (= {:row-count 1}
                 (append-csv! {:file     file
                               :table-id (:id table)})))
          ;; Only create auto-pk columns for drivers that supported uploads before auto-pk columns
          ;; were introduced by metabase#36249. Otherwise we can assume that the table was created
          ;; with an auto-pk column.
          (if (driver/create-auto-pk-with-append-csv? driver/*driver*)
            (do
              (testing "Check a _mb_row_id column was created"
                (is (= ["name" "_mb_row_id"]
                       (column-names-for-table table))))
              (testing "Check a _mb_row_id column was sync'd"
                (is (=? {:semantic_type :type/PK
                         :base_type     :type/BigInteger
                         :name          "_mb_row_id"
                         :display_name  "_mb_row_id"}
                        (t2/select-one :model/Field :table_id (:id table) :name upload/auto-pk-column-name))))
              (testing "Check the data was uploaded into the table, but the _mb_row_id column values were ignored"
                (is (= [["Obi-Wan Kenobi" 1]
                        ["Luke Skywalker" 2]]
                       (rows-for-table table)))))
            (do
              (testing "Check a _mb_row_id column wasn't created"
                (is (= ["name"]
                       (column-names-for-table table))))
              (testing "Check the data was uploaded into the table"
                (is (= [["Obi-Wan Kenobi"]
                        ["Luke Skywalker"]]
                       (rows-for-table table))))))
          (io/delete-file file))))))

(deftest append-no-mb-row-id-failure-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "If the table doesn't have _mb_row_id and a failure occurs, we shouldn't create a _mb_row_id column"
      (with-upload-table!
        [table (create-upload-table! {:col->upload-type (ordered-map/ordered-map
                                                         :bool_column ::upload/boolean)
                                      :rows [[true]]})]
        (let [csv-rows    ["bool_column" "not a bool"]
              file        (csv-file-with csv-rows (mt/random-name))
              get-auto-pk (fn []
                            (t2/select-one :model/Field :table_id (:id table) :name upload/auto-pk-column-name))]
          (is (nil? (get-auto-pk)))
          (is (thrown? Exception
                       (append-csv! {:file     file
                                     :table-id (:id table)})))
          (testing "Check a _mb_row_id column was not created"
            (is (= ["bool_column"]
                   (column-names-for-table table))))
          (testing "Check a _mb_row_id column was not sync'd"
            (is (nil? (get-auto-pk))))
          (testing "Check the data was not uploaded into the table"
            (is (= [[true]]
                   (rows-for-table table))))
          (io/delete-file file))))))

(deftest append-mb-row-id-table-only-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Append succeeds if the table has _mb_row_id but the CSV doesn't"
      (with-upload-table! [table (create-upload-table!)]
        (let [csv-rows ["name" "Luke Skywalker"]
              file     (csv-file-with csv-rows (mt/random-name))]
          (is (= {:row-count 1}
                 (append-csv! {:file     file
                               :table-id (:id table)})))
          (testing "Check the data was uploaded into the table, but the _mb_row_id was ignored"
            (is (= (rows-with-auto-pk
                    [["Obi-Wan Kenobi"]
                     ["Luke Skywalker"]])
                   (rows-for-table table))))
          (io/delete-file file))))))

(deftest append-mb-row-id-csv-and-table-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :upload-with-auto-pk)
    (testing "Append succeeds if the table has _mb_row_id and the CSV does too"
      (with-upload-table! [table (create-upload-table!)]
        (let [csv-rows ["_mb_row_id,name" "1000,Luke Skywalker"]
              file     (csv-file-with csv-rows (mt/random-name))]
          (is (= {:row-count 1}
                 (append-csv! {:file     file
                               :table-id (:id table)})))
          (testing "Check the data was uploaded into the table, but the _mb_row_id was ignored"
            (is (= (rows-with-auto-pk
                    [["Obi-Wan Kenobi"]
                     ["Luke Skywalker"]])
                   (rows-for-table table))))
          (io/delete-file file)))
      (testing "with duplicate normalized _mb_row_id columns in the CSV file"
        (with-upload-table! [table (create-upload-table!)]
          (let [csv-rows ["_mb_row_id,name,-MB-ROW-ID" "1000,Luke Skywalker,1001"]
                file  (csv-file-with csv-rows (mt/random-name))]
            (is (= {:row-count 1}
                   (append-csv! {:file     file
                                 :table-id (:id table)})))
            (testing "Check the data was uploaded into the table, but the _mb_row_id was ignored"
              (is (= (rows-with-auto-pk
                      [["Obi-Wan Kenobi"]
                       ["Luke Skywalker"]])
                     (rows-for-table table))))
            (io/delete-file file)))))))

(deftest append-duplicate-header-csv-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Append should fail if the CSV file contains duplicate column names"
      (with-upload-table! [table (create-upload-table!)]
        (let [csv-rows ["name,name" "Luke Skywalker,Darth Vader"]
              file     (csv-file-with csv-rows (mt/random-name))]
          (is (= {:message "The CSV file contains duplicate column names."
                  :data    {:status-code 422}}
                 (catch-ex-info (append-csv! {:file     file
                                              :table-id (:id table)}))))
          (testing "Check the data was not uploaded into the table"
            (is (= (rows-with-auto-pk
                    [["Obi-Wan Kenobi"]])
                   (rows-for-table table))))
          (io/delete-file file))))))

(deftest append-reorder-header-csv-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Append should handle the columns in the CSV file being reordered"
      (with-upload-table! [table (create-upload-table!
                                  :col->upload-type (columns-with-auto-pk
                                                     (ordered-map/ordered-map
                                                      :name ::upload/varchar-255
                                                      :shame ::upload/varchar-255))
                                  :rows [["Obi-Wan Kenobi" "No one really knows me"]])]

        (let [csv-rows ["shame,name" "Nothing - you can't prove it,Puke Nightstalker"]
              file     (csv-file-with csv-rows (mt/random-name))]

          (testing "The new row is inserted with the values correctly reordered"
            (is (= {:row-count 1} (append-csv! {:file file, :table-id (:id table)})))
            (is (= (set (rows-with-auto-pk
                         [["Obi-Wan Kenobi" "No one really knows me"]
                          ["Puke Nightstalker" "Nothing - you can't prove it"]]))
                   (set (rows-for-table table)))))
          (io/delete-file file))))))

(deftest append-type-mismatch-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (testing "Append fails if the CSV file contains values that don't match the column types"
        ;; for drivers that insert rows in chunks, we change the chunk size to 1 so that we can test that the
        ;; inserted rows are rolled back
        (binding [driver/*insert-chunk-rows* 1]
          (doseq [auto-pk-column? (if (driver.u/supports? driver/*driver* :upload-with-auto-pk (mt/db))
                                    [true false]
                                    [false])]
            (testing (str "\nFor a table that has " (if auto-pk-column? "an" " no") " automatically generated PK already")
              (doseq [{:keys [upload-type valid invalid msg]}
                      (cond-> [{:upload-type ::upload/int
                                :valid       1
                                :invalid     "not an int"
                                :msg         "'not an int' is not a recognizable number"}
                               {:upload-type ::upload/float
                                :valid       1.1
                                :invalid     "not a float"
                                :msg         "'not a float' is not a recognizable number"}
                               {:upload-type ::upload/boolean
                                :valid       true
                                :invalid     "correct"
                                :msg         "'correct' is not a recognizable boolean"}
                               {:upload-type ::upload/date
                                :valid       #t "2000-01-01"
                                :invalid     "2023-01-01T00:00:00"
                                :msg         "'2023-01-01T00:00:00' is not a recognizable date"}
                               {:upload-type ::upload/datetime
                                :valid       #t "2000-01-01T00:00:00"
                                :invalid     "2023-01-01T00:00:00+01"
                                :msg         "'2023-01-01T00:00:00+01' is not a recognizable datetime"}]
                        (driver/upload-type->database-type driver/*driver* ::upload/offset-datetime)
                        (conj {:upload-type ::upload/offset-datetime
                               :valid       #t "2000-01-01T00:00:00+01"
                               :invalid     "2023-01-01T00:00:00[Europe/Helsinki]"
                               :msg         "'2023-01-01T00:00:00[Europe/Helsinki]' is not a recognizable zoned datetime"}))]
                (testing (str "\nTry to upload an invalid value for " upload-type)
                  (with-upload-table!
                    [table (create-upload-table!
                            {:col->upload-type (columns-with-auto-pk
                                                (ordered-map/ordered-map
                                                 :test_column upload-type
                                                 :name        ::upload/varchar-255))
                             :rows             [[valid "Obi-Wan Kenobi"]]})]
                    (let [;; The CSV contains 50 valid rows and 1 invalid row
                          csv-rows `["test_column,name" ~@(repeat 50 (str valid ",Darth Vadar")) ~(str invalid ",Luke Skywalker")]
                          file  (csv-file-with csv-rows (mt/random-name))]
                      (testing "\nShould return an appropriate error message"
                        (is (= {:message msg
                                :data    {:status-code 422}}
                               (catch-ex-info (append-csv! {:file     file
                                                            :table-id (:id table)})))))
                      (testing "\nCheck the data was not uploaded into the table"
                        (is (= 1 (count (rows-for-table table)))))
                      (io/delete-file file))))))))))))

;; FIXME: uploading to a varchar-255 column can fail if the text is too long
;; We ideally want to change the column type to text if we detect this will happen, but that's difficult
;; currently because we don't store the character length of the column. e.g. a varchar(255) column in postgres
;; will have `varchar` as the database_type in metabase_field.
;; In any case, this test documents the current behaviour
(deftest append-too-long-for-varchar-255-test
  (mt/test-drivers (filter (fn [driver]
                             ;; use of varchar(255) is not universal for all drivers, so only test drivers that
                             ;; have different database types for varchar(255) and text
                             (apply not= (map (partial driver/upload-type->database-type driver) [::upload/varchar-255 ::upload/text])))
                           (mt/normal-drivers-with-feature :uploads))
    (with-mysql-local-infile-off
      (testing "Append fails if the CSV file contains string values that are too long for the column"
        ;; for drivers that insert rows in chunks, we change the chunk size to 1 so that we can test that the
        ;; inserted rows are rolled back
        (binding [driver/*insert-chunk-rows* 1]
          (with-upload-table!
            [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                             (ordered-map/ordered-map
                                                              :test_column ::upload/varchar-255))
                                          :rows             [["valid"]]})]
            (let [csv-rows `["test_column" ~@(repeat 50 "valid too") ~(apply str (repeat 256 "x"))]
                  file  (csv-file-with csv-rows (mt/random-name))]
              (testing "\nShould return an appropriate error message"
                (is (=? {;; the error message is different for different drivers, but postgres and mysql have "too long" in the message
                         :message #"[\s\S]*too long[\s\S]*"
                         :data    {:status-code 422}}
                        (catch-ex-info (append-csv! {:file     file
                                                     :table-id (:id table)})))))
              (testing "\nCheck the data was not uploaded into the table"
                (is (= 1 (count (rows-for-table table)))))
              (io/delete-file file))))))))

(deftest append-too-long-for-varchar-255-mysql-local-infile-test
  (mt/test-driver :mysql
    (with-mysql-local-infile-on
      (testing "Append succeeds if the CSV file is uploaded to MySQL and contains a string value that is too long for the column"
        ;; for drivers that insert rows in chunks, we change the chunk size to 1 so that we can test that the
        ;; inserted rows are rolled back
        (binding [driver/*insert-chunk-rows* 1]
          (let [upload-type ::upload/varchar-255,
                uncoerced   (apply str (repeat 256 "x"))
                coerced     (apply str (repeat 255 "x"))]
            (testing (format "\nUploading %s into a column of type %s should be coerced to %s"
                             uncoerced (name upload-type) coerced)
              (with-upload-table!
                [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                                 (ordered-map/ordered-map :test_column upload-type))
                                              :rows             []})]
                (let [csv-rows ["test_column" uncoerced]
                      file (csv-file-with csv-rows (mt/random-name))]
                  (testing "\nAppend should succeed"
                    (is (= {:row-count 1}
                           (append-csv! {:file     file
                                         :table-id (:id table)}))))
                  (testing "\nCheck the value was coerced correctly"
                    (is (= (rows-with-auto-pk [[coerced]])
                           (rows-for-table table))))
                  (io/delete-file file))))))))))

(deftest append-type-coercion-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (testing "Append succeeds if the CSV file contains values that don't match the column types, but are coercible"
        ;; for drivers that insert rows in chunks, we change the chunk size to 1 so that we can test that the
        ;; inserted rows are rolled back
        (binding [driver/*insert-chunk-rows* 1]
          (doseq [{:keys [upload-type uncoerced coerced fail-msg] :as args}
                  [{:upload-type ::upload/int,     :uncoerced "2.1",        :fail-msg "'2.1' is not an integer"}
                   {:upload-type ::upload/int,     :uncoerced "2.0",        :coerced 2}
                   {:upload-type ::upload/float,   :uncoerced "2",          :coerced 2.0}
                   {:upload-type ::upload/boolean, :uncoerced "0",          :coerced false}
                   {:upload-type ::upload/boolean, :uncoerced "1.0",        :fail-msg "'1.0' is not a recognizable boolean"}
                   {:upload-type ::upload/boolean, :uncoerced "0.0",        :fail-msg "'0.0' is not a recognizable boolean"}
                   {:upload-type ::upload/int,     :uncoerced "01/01/2012", :fail-msg "'01/01/2012' is not a recognizable number"}]]
            (with-upload-table!
              [table (create-upload-table! {:col->upload-type (columns-with-auto-pk
                                                               (ordered-map/ordered-map :test_column upload-type))
                                            :rows             []})]
              (let [csv-rows ["test_column" uncoerced]
                    file  (csv-file-with csv-rows (mt/random-name))
                    append! (fn []
                              (append-csv! {:file     file
                                            :table-id (:id table)}))]
                (if (contains? args :coerced)
                  (testing (format "\nUploading %s into a column of type %s should be coerced to %s"
                                   uncoerced (name upload-type) coerced)
                    (testing "\nAppend should succeed"
                      (is (= {:row-count 1}
                             (append!))))
                    (is (= (rows-with-auto-pk [[coerced]])
                           (rows-for-table table))))
                  (testing (format "\nUploading %s into a column of type %s should fail to coerce"
                                   uncoerced (name upload-type))
                    (is (thrown-with-msg?
                          clojure.lang.ExceptionInfo
                          (re-pattern (str "^" fail-msg "$"))
                          (append!)))))
                (io/delete-file file)))))))))
