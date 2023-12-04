(ns metabase.upload-test
  (:require
   [clj-bom.core :as bom]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models :refer [Field Table]]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.upload :as upload]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def ^:private bool-type      ::upload/boolean)
(def ^:private int-type       ::upload/int)
(def ^:private float-type     ::upload/float)
(def ^:private vchar-type     ::upload/varchar-255)
(def ^:private date-type      ::upload/date)
(def ^:private datetime-type  ::upload/datetime)
(def ^:private offset-dt-type ::upload/offset-datetime)
(def ^:private text-type      ::upload/text)
(def ^:private auto-pk-type ::upload/auto-incrementing-int-pk)

(defn- local-infile-on? []
  (= "ON" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              (jdbc/query "show global variables like 'local_infile'")
              first
              :value)))

(defn- set-local-infile! [on?]
  (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec (mt/db)) (str "set global local_infile = " (if on? 1 0))))

(defn- do-with-mysql-local-infile-on
  [thunk]
  (if (local-infile-on?)
    (thunk)
    (try
      (set-local-infile! true)
      (thunk)
      (finally
        (set-local-infile! false)))))

(defn- do-with-mysql-local-infile-off
  [thunk]
  (if-not (local-infile-on?)
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
    (let [settings {:number-separators (or seps ".,")}
          type     (#'upload/value->type string-value settings)
          parser   (upload-parsing/upload-type->parser type settings)]
      (testing (format "\"%s\" is a %s" string-value type)
        (is (= expected-type
               type)))
      (testing (format "\"%s\" is parsed into %s" string-value expected-value)
        (is (= expected-value
               (parser string-value)))))))

(deftest ^:parallel type-coalescing-test
  (doseq [[type-a          type-b        expected]
          [[bool-type      bool-type     bool-type]
           [bool-type      int-type      int-type]
           [bool-type      date-type     vchar-type]
           [bool-type      datetime-type vchar-type]
           [bool-type      vchar-type    vchar-type]
           [bool-type      text-type     text-type]
           [int-type       bool-type     int-type]
           [int-type       float-type    float-type]
           [int-type       date-type     vchar-type]
           [int-type       datetime-type vchar-type]
           [int-type       vchar-type    vchar-type]
           [int-type       text-type     text-type]
           [float-type     vchar-type    vchar-type]
           [float-type     text-type     text-type]
           [float-type     date-type     vchar-type]
           [float-type     datetime-type vchar-type]
           [date-type      datetime-type datetime-type]
           [date-type      vchar-type    vchar-type]
           [date-type      text-type     text-type]
           [datetime-type  vchar-type    vchar-type]
           [offset-dt-type vchar-type    vchar-type]
           [datetime-type  text-type     text-type]
           [offset-dt-type text-type     text-type]
           [vchar-type     text-type     text-type]]]
    (is (= expected (#'upload/lowest-common-ancestor type-a type-b))
        (format "%s + %s = %s" (name type-a) (name type-b) (name expected)))))

(defn csv-file-with
  "Create a temp csv file with the given content and return the file"
  ([rows]
   (csv-file-with rows "test"))
  ([rows filename]
   (csv-file-with rows filename io/writer))
  ([rows filename writer-fn]
   (let [contents (str/join "\n" rows)
         csv-file (doto (File/createTempFile filename ".csv")
                    (.deleteOnExit))]
     (with-open [^java.io.Writer w (writer-fn csv-file)]
       (.write w contents))
     csv-file)))

(defn- with-ai-id
  [col->type]
  {:generated-columns {(keyword @#'upload/auto-pk-column-name) auto-pk-type}
   :extant-columns    col->type})

(deftest ^:parallel detect-schema-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Well-formed CSV file"
      (is (=? (with-ai-id {:name             vchar-type
                           :age              int-type
                           :favorite_pokemon vchar-type})
              (upload/detect-schema
               (csv-file-with ["Name, Age, Favorite Pokémon"
                               "Tim, 12, Haunter"
                               "Ryan, 97, Paras"])))))
    (testing "CSV missing data"
      (is (=? (with-ai-id {:name       vchar-type
                           :height     int-type
                           :birth_year float-type})
              (upload/detect-schema
               (csv-file-with ["Name, Height, Birth Year"
                               "Luke Skywalker, 172, -19"
                               "Darth Vader, 202, -41.9"
                               "Watto, 137"          ; missing column
                               "Sebulba, 112,"]))))) ; comma, but blank column
    (testing "Type coalescing"
      (is (=? (with-ai-id {:name       vchar-type
                           :height     float-type
                           :birth_year vchar-type})
              (upload/detect-schema
               (csv-file-with ["Name, Height, Birth Year"
                               "Rey Skywalker, 170, 15"
                               "Darth Vader, 202.0, 41.9BBY"])))))
    (testing "Boolean coalescing"
      (is (=? (with-ai-id {:name          vchar-type
                           :is_jedi_      bool-type
                           :is_jedi__int_ int-type
                           :is_jedi__vc_  vchar-type})
              (upload/detect-schema
               (csv-file-with ["Name, Is Jedi?, Is Jedi (int), Is Jedi (VC)"
                               "Rey Skywalker, yes, true, t"
                               "Darth Vader, YES, TRUE, Y"
                               "Grogu, 1, 9001, probably?"
                               "Han Solo, no, FaLsE, 0"])))))
    (testing "Order is ensured"
      (let [header "a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,zz,yy,xx,ww,vv,uu,tt,ss,rr,qq,pp,oo,nn,mm,ll,kk,jj,ii,hh,gg,ff,ee,dd,cc,bb,aa"]
        (is (= (map keyword (str/split header #","))
               (keys
                (:extant-columns
                 (upload/detect-schema
                  (csv-file-with [header
                                  "Luke,ah'm,yer,da,,,missing,columns,should,not,matter"]))))))))
    (testing "Empty contents (with header) are okay"
      (is (=? (with-ai-id {:name     text-type
                           :is_jedi_ text-type})
              (upload/detect-schema
               (csv-file-with ["Name, Is Jedi?"])))))
    (testing "Completely empty contents are okay"
      (is (=? (with-ai-id {})
              (upload/detect-schema
               (csv-file-with [""])))))
    (testing "CSV missing data in the top row"
      (is (=? (with-ai-id {:name       vchar-type
                           :height     int-type
                           :birth_year float-type})
              (upload/detect-schema
               (csv-file-with ["Name, Height, Birth Year"
                              ;; missing column
                               "Watto, 137"
                               "Luke Skywalker, 172, -19"
                               "Darth Vader, 202, -41.9"
                              ;; comma, but blank column
                               "Sebulba, 112,"])))))
    (testing "Existing _mb_row_id column"
      (is (=? {:extant-columns    {:ship       vchar-type
                                   :name       vchar-type
                                   :weapon     vchar-type}
               :generated-columns {:_mb_row_id auto-pk-type}}
              (upload/detect-schema
               (csv-file-with ["_mb_row_id,ship,name,weapon"
                               "1,Serenity,Malcolm Reynolds,Pistol"
                               "2,Millennium Falcon, Han Solo,Blaster"])))))
    (testing "Existing ID column"
      (is (=? {:extant-columns    {:id         int-type
                                   :ship       vchar-type
                                   :name       vchar-type
                                   :weapon     vchar-type}
               :generated-columns {:_mb_row_id auto-pk-type}}
              (upload/detect-schema
               (csv-file-with ["id,ship,name,weapon"
                               "1,Serenity,Malcolm Reynolds,Pistol"
                               "2,Millennium Falcon, Han Solo,Blaster"])))))))

(deftest ^:parallel detect-schema-dates-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Dates"
      (is (=? (with-ai-id {:date         date-type
                           :not_date     vchar-type
                           :datetime     datetime-type
                           :not_datetime vchar-type})
              (upload/detect-schema
               (csv-file-with ["Date      ,Not Date  ,Datetime           ,Not datetime       "
                               "2022-01-01,2023-02-28,2022-01-01T00:00:00,2023-02-28T00:00:00"
                               "2022-02-01,2023-02-29,2022-01-01T00:00:00,2023-02-29T00:00:00"])))))))

(deftest ^:parallel detect-schema-offset-datetimes-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Dates"
      (is (=? (with-ai-id {:offset_datetime offset-dt-type
                           :not_datetime   vchar-type})
              (upload/detect-schema
               (csv-file-with ["Offset Datetime,Not Datetime"
                               "2022-01-01T00:00:00-01:00,2023-02-28T00:00:00-01:00"
                               "2022-01-01T00:00:00-01:00,2023-02-29T00:00:00-01:00"
                               "2022-01-01T00:00:00Z,2023-02-29T00:00:00-01:00"])))))))

(deftest ^:parallel unique-table-name-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "File name is slugified"
      (is (=? #"my_file_name_\d+" (#'upload/unique-table-name driver/*driver* "my file name"))))
    (testing "semicolons are removed"
      (is (nil? (re-find #";" (#'upload/unique-table-name driver/*driver* "some text; -- DROP TABLE.csv")))))))

(deftest load-from-csv-table-name-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (let [file       (csv-file-with ["id" "2" "3"])]
          (testing "Can upload two files with the same name"
            (is (some? (upload/load-from-csv! driver/*driver* (mt/id) (format "table_name_%s" driver/*driver*) file)))
            (is (some? (upload/load-from-csv! driver/*driver* (mt/id) (format "table_name_2_%s" driver/*driver*) file)))))))))

(defn- query-table
  [table]
  (qp/process-query {:database (:db_id table)
                     :type     :query
                     :query    {:source-table (:id table)}}))

(defn- column-names-for-table
  [table]
  (->> (query-table table)
       mt/cols
       (map (comp u/lower-case-en :name))))

(defn- rows-for-table
  [table]
  (mt/rows (query-table table)))

(deftest load-from-csv-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id    ,nulls,string ,bool ,number       ,date      ,datetime"
                           "2\t   ,,          a ,true ,1.1\t        ,2022-01-01,2022-01-01T00:00:00"
                           "\" 3\",,           b,false,\"$ 1,000.1\",2022-02-01,2022-02-01T00:00:00"]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name         #"(?i)upload_test"
                       :display_name "Upload Test"}
                      table))
              (is (=? {:name          #"(?i)_mb_row_id"
                       :semantic_type :type/PK
                       :base_type     :type/BigInteger}
                      (t2/select-one Field :database_position 0 :table_id (:id table))))
              (is (=? {:name          #"(?i)id"
                       :semantic_type :type/PK
                       :base_type     :type/BigInteger}
                      (t2/select-one Field :database_position 1 :table_id (:id table))))
              (is (=? {:name      #"(?i)nulls"
                       :base_type :type/Text}
                      (t2/select-one Field :database_position 2 :table_id (:id table))))
              (is (=? {:name      #"(?i)string"
                       :base_type :type/Text}
                      (t2/select-one Field :database_position 3 :table_id (:id table))))
              (is (=? {:name      #"(?i)bool"
                       :base_type :type/Boolean}
                      (t2/select-one Field :database_position 4 :table_id (:id table))))
              (is (=? {:name      #"(?i)number"
                       :base_type :type/Float}
                      (t2/select-one Field :database_position 5 :table_id (:id table))))
              (is (=? {:name      #"(?i)date"
                       :base_type :type/Date}
                      (t2/select-one Field :database_position 6 :table_id (:id table))))
              (is (=? {:name      #"(?i)datetime"
                       :base_type (if (= driver/*driver* :mysql) :type/DateTimeWithLocalTZ :type/DateTime)}
                      (t2/select-one Field :database_position 7 :table_id (:id table))))
              (testing "Check the data was uploaded into the table"
                (is (= 2
                       (count (rows-for-table table))))))))))))

(deftest load-from-csv-date-test
  (testing "Upload a CSV file with a datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["datetime"
                           "2022-01-01"
                           "2022-01-01 00:00"
                           "2022-01-01T00:00:00"
                           "2022-01-01T00:00"]))
          (testing "Fields exists after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the datetime column the correct base_type"
                (is (=? {:name      #"(?i)datetime"
                         :base_type (if (= driver/*driver* :mysql) :type/DateTimeWithLocalTZ :type/DateTime)}
                      ;; db position is 1; 0 is for the auto-inserted ID
                        (t2/select-one Field :database_position 1 :table_id (:id table)))))
              (is (some? table)))))))))

(deftest load-from-csv-offset-datetime-test
  (testing "Upload a CSV file with a datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (with-redefs [driver/db-default-timezone (constantly "Z")
                        upload/current-database    (constantly (mt/db))]
            (let [datetime-pairs [["2022-01-01T12:00:00-07"    "2022-01-01T19:00:00Z"]
                                  ["2022-01-01T12:00:00-07:00" "2022-01-01T19:00:00Z"]
                                  ["2022-01-01T12:00:00-07:30" "2022-01-01T19:30:00Z"]
                                  ["2022-01-01T12:00:00Z"      "2022-01-01T12:00:00Z"]
                                  ["2022-01-01T12:00:00-00:00" "2022-01-01T12:00:00Z"]
                                  ["2022-01-01T12:00:00+07"    "2022-01-01T05:00:00Z"]
                                  ["2022-01-01T12:00:00+07:00" "2022-01-01T05:00:00Z"]
                                  ["2022-01-01T12:00:00+07:30" "2022-01-01T04:30:00Z"]]]
              (upload/load-from-csv!
               driver/*driver*
               (mt/id)
               "upload_test"
               (csv-file-with (into ["offset_datetime"] (map first datetime-pairs))))
              (testing "Fields exists after sync"
                (sync/sync-database! (mt/db))
                (let [table (t2/select-one Table :db_id (mt/id))]
                  (is (=? {:name #"(?i)upload_test"} table))
                  (testing "Check the offset datetime column the correct base_type"
                    (is (=? {:name      #"(?i)offset_datetime"
                             :base_type :type/DateTimeWithLocalTZ}
                          ;; db position is 1; 0 is for the auto-inserted ID
                            (t2/select-one Field :database_position 1 :table_id (:id table)))))
                  (is (= (map second datetime-pairs)
                         (map second (rows-for-table table)))))))))))))

(deftest load-from-csv-boolean-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
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
                           "18,0"]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the boolean column has a boolean base_type"
                (is (=? {:name      #"(?i)bool"
                         :base_type :type/Boolean}
                        (t2/select-one Field :database_position 2 :table_id (:id table)))))
              (testing "Check the data was uploaded into the table correctly"
                (let [bool-column (map #(nth % 2) (rows-for-table table))
                      alternating (map even? (range (count bool-column)))]
                  (is (= alternating bool-column)))))))))))

(deftest load-from-csv-length-test
  (testing "Upload a CSV file with large names and numbers"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (let [length-limit (driver/table-name-length-limit driver/*driver*)
            long-name    (apply str (repeat 33 "abcdefgh")) ; 33×8 = 264. Max is H2 at 256
            short-name   (subs long-name 0 (- length-limit (count "_yyyyMMddHHmmss")))]
        (is (pos? length-limit) "driver/table-name-length-limit has been set")
        (with-mysql-local-infile-on-and-off
          (mt/with-empty-db
            (upload/load-from-csv!
             driver/*driver*
             (mt/id)
             (upload/unique-table-name driver/*driver* long-name)
             (csv-file-with ["number,bool"
                             "1,true"
                             "2,false"
                             (format "%d,true" Long/MAX_VALUE)]))
            (testing "It truncates it to the right number of characters, allowing for the timestamp"
              (sync/sync-database! (mt/db))
              (let [table    (t2/select-one Table :db_id (mt/id) :%lower.name [:like (str short-name "%")])
                    table-re (re-pattern (str "(?i)" short-name "_\\d{14}"))]
                (is (re-matches table-re (:name table)))
                (testing "Check the data was uploaded into the table correctly"
                  (is (= [[1 1 true]
                          [2 2 false]
                          [3 Long/MAX_VALUE true]]
                         (rows-for-table table))))))))))))

(deftest load-from-csv-empty-header-test
  (testing "Upload a CSV file with a blank column name"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (upload/load-from-csv!
         driver/*driver*
         (mt/id)
         "upload_test"
         (csv-file-with [",ship name,"
                         "1,Serenity,Malcolm Reynolds"
                         "2,Millennium Falcon, Han Solo"]))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= [@#'upload/auto-pk-column-name "unnamed_column" "ship_name" "unnamed_column_2"]
                     (column-names-for-table table))))))))))

(deftest load-from-csv-duplicate-names-test
  (testing "Upload a CSV file with duplicate column names"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["unknown,unknown,unknown,unknown_2"
                           "1,Serenity,Malcolm Reynolds,Pistol"
                           "2,Millennium Falcon, Han Solo,Blaster"]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [@#'upload/auto-pk-column-name "unknown" "unknown_2" "unknown_3" "unknown_2_2"]
                       (column-names-for-table table)))))))))))

(deftest load-from-csv-existing-id-column-test
  (testing "Upload a CSV file with an existing ID column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,ship,name,weapon"
                           "1,Serenity,Malcolm Reynolds,Pistol"
                           "2,Millennium Falcon,Han Solo,Blaster"
                           ;; A huge ID to make extra sure we're using bigints
                           "9000000000,Razor Crest,Din Djarin,Spear"]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [@#'upload/auto-pk-column-name "id" "ship" "name" "weapon"]
                       (column-names-for-table table)))
                (is (=? {:name                       #"(?i)id"
                         :semantic_type              :type/PK
                         :base_type                  :type/BigInteger
                         :database_is_auto_increment false}
                        (t2/select-one Field :database_position 1 :table_id (:id table))))))))))))

(deftest load-from-csv-existing-string-id-column-test
  (testing "Upload a CSV file with an existing string ID column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,ship,name,weapon"
                           "a,Serenity,Malcolm Reynolds,Pistol"
                           "b,Millennium Falcon,Han Solo,Blaster"]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [@#'upload/auto-pk-column-name "id" "ship" "name" "weapon"]
                       (column-names-for-table table)))
                (is (=? {:name                       #"(?i)id"
                         :semantic_type              :type/PK
                         :base_type                  :type/Text
                         :database_is_auto_increment false}
                        (t2/select-one Field :database_position 1 :table_id (:id table))))))))))))

(deftest load-from-csv-reserved-db-words-test
  (testing "Upload a CSV file with column names that are reserved by the DB, ignoring them"
    (testing "A single column whose name normalizes to _mb_row_id"
      (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
        (with-mysql-local-infile-on-and-off
          (mt/with-empty-db
            (upload/load-from-csv!
             driver/*driver*
             (mt/id)
             "upload_test"
             (csv-file-with ["_mb_ROW-id,ship,captain"
                             "100,Serenity,Malcolm Reynolds"
                             "3,Millennium Falcon, Han Solo"]))
            (testing "Table and Fields exist after sync"
              (sync/sync-database! (mt/db))
              (let [table (t2/select-one Table :db_id (mt/id))]
                (is (=? {:name #"(?i)upload_test"} table))
                (testing "Check the data was uploaded into the table correctly"
                  (is (= ["_mb_row_id", "ship", "captain"]
                         (column-names-for-table table)))
                  (is (= [[1 "Serenity" "Malcolm Reynolds"]
                          [2 "Millennium Falcon" " Han Solo"]]
                         (rows-for-table table))))))))))
    (testing "Multiple identical column names that normalize to _mb_row_id"
      (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
        (with-mysql-local-infile-on-and-off
          (mt/with-empty-db
            (upload/load-from-csv!
             driver/*driver*
             (mt/id)
             "upload_test"
             (csv-file-with ["_mb row id,ship,captain,_mb row id"
                             "100,Serenity,Malcolm Reynolds,200"
                             "3,Millennium Falcon, Han Solo,4"]))
            (testing "Table and Fields exist after sync"
              (sync/sync-database! (mt/db))
              (let [table (t2/select-one Table :db_id (mt/id))]
                (is (=? {:name #"(?i)upload_test"} table))
                (testing "Check the data was uploaded into the table correctly"
                  (is (= ["_mb_row_id", "ship", "captain"]
                         (column-names-for-table table)))
                  (is (= [[1 "Serenity" "Malcolm Reynolds"]
                          [2 "Millennium Falcon" " Han Solo"]]
                         (rows-for-table table))))))))))
    (testing "Multiple different column names that normalize to _mb_row_id"
      (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
        (with-mysql-local-infile-on-and-off
          (mt/with-empty-db
            (upload/load-from-csv!
             driver/*driver*
             (mt/id)
             "upload_test"
             (csv-file-with ["_mb row id,ship,captain,_MB_ROW_ID"
                             "100,Serenity,Malcolm Reynolds,200"
                             "3,Millennium Falcon, Han Solo,4"]))
            (testing "Table and Fields exist after sync"
              (sync/sync-database! (mt/db))
              (let [table (t2/select-one Table :db_id (mt/id))]
                (is (=? {:name #"(?i)upload_test"} table))
                (testing "Check the data was uploaded into the table correctly"
                  (is (= ["_mb_row_id", "ship", "captain"]
                         (column-names-for-table table)))
                  (is (= [[1 "Serenity" "Malcolm Reynolds"]
                          [2 "Millennium Falcon" " Han Solo"]]
                         (rows-for-table table))))))))))))

(deftest load-from-csv-missing-values-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (with-mysql-local-infile-on-and-off
      (mt/with-empty-db
        (testing "Can upload a CSV with missing values"
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["column_that_has_one_value,column_that_doesnt_have_a_value"
                           "2"
                           "  ,\n"]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [@#'upload/auto-pk-column-name "column_that_has_one_value", "column_that_doesnt_have_a_value"]
                       (column-names-for-table table)))
                (is (= [[1 2 nil]
                        [2 nil nil]]
                       (rows-for-table table)))))))))))

(deftest load-from-csv-tab-test
  (testing "Upload a CSV file with tabs in the values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["ship,captain"
                           "Serenity,Malcolm\tReynolds"
                           "Millennium\tFalcon,Han\tSolo"]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [@#'upload/auto-pk-column-name "ship", "captain"]
                       (column-names-for-table table)))
                (is (= [[1 "Serenity" "Malcolm\tReynolds"]
                        [2 "Millennium\tFalcon" "Han\tSolo"]]
                       (rows-for-table table)))))))))))

(deftest load-from-csv-carriage-return-test
  (testing "Upload a CSV file with carriage returns in the values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["ship,captain"
                           "Serenity,\"Malcolm\rReynolds\""
                           "\"Millennium\rFalcon\",\"Han\rSolo\""]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [@#'upload/auto-pk-column-name, "ship", "captain"]
                       (column-names-for-table table)))
                (is (= [[1 "Serenity" "Malcolm\rReynolds"]
                        [2 "Millennium\rFalcon" "Han\rSolo"]]
                       (rows-for-table table)))))))))))

(deftest load-from-csv-BOM-test
  (testing "Upload a CSV file with a byte-order mark (BOM)"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["ship,captain"
                           "Serenity,Malcolm Reynolds"
                           "Millennium Falcon, Han Solo"]
                          "star-wars"
                          (partial bom/bom-writer "UTF-8")))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [@#'upload/auto-pk-column-name, "ship", "captain"]
                       (column-names-for-table table)))))))))))

(deftest load-from-csv-injection-test
  (testing "Upload a CSV file with very rude values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (with-mysql-local-infile-on-and-off
        (mt/with-empty-db
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id integer); --,ship,captain"
                           "1,Serenity,--Malcolm Reynolds"
                           "2,;Millennium Falcon,Han Solo\""]
                          "\"; -- Very rude filename"))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [@#'upload/auto-pk-column-name "id_integer_____" "ship" "captain"]
                       (column-names-for-table table)))
                (is (= [[1 1 "Serenity"           "--Malcolm Reynolds"]
                        [2 2 ";Millennium Falcon" "Han Solo\""]]
                       (rows-for-table table)))))))))))

(deftest load-from-csv-eof-marker-test
  (testing "Upload a CSV file with Postgres's 'end of input' marker"
    (mt/test-drivers [:postgres]
      (mt/with-empty-db
        (upload/load-from-csv!
         driver/*driver*
         (mt/id)
         "upload_test"
         (csv-file-with ["name"
                         "Malcolm"
                         "\\."
                         "Han"]))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= [[1 "Malcolm"] [2 "\\."] [3 "Han"]]
                     (rows-for-table table))))))))))

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
