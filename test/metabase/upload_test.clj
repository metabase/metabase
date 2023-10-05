(ns metabase.upload-test
  (:require
   [clj-bom.core :as bom]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models :refer [Field Table]]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def ^:private bool-type        :metabase.upload/boolean)
(def ^:private int-type         :metabase.upload/int)
(def ^:private float-type       :metabase.upload/float)
(def ^:private vchar-type       :metabase.upload/varchar_255)
(def ^:private date-type        :metabase.upload/date)
(def ^:private datetime-type    :metabase.upload/datetime)
(def ^:private text-type        :metabase.upload/text)
(def ^:private pk-type          :metabase.upload/pk)
(def ^:private pk-schema [:map
                          [:type [:= pk-type]]
                          [:opts [:or [:= [:primary-key]]
                                      [:= [:auto-increment [:not nil]]]]]
                          [:exclude-in-insert? {:optional true} boolean?]])

(defn- do-with-mysql-local-infile-activated
  "Helper for [[with-mysql-local-infile-activated]]"
  [thunk]
  (if (or
       (not= :mysql driver/*driver*)
       (= "ON" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                   (jdbc/query
                    ["show global variables like 'local_infile'"])
                   first
                   :value)))
    (thunk)
    (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
      (try
        (jdbc/query conn-spec
                    "set global local_infile = 1")
        (thunk)
        (finally
          (jdbc/query conn-spec
                      "set global local_infile = 0"))))))

(defmacro ^:private with-mysql-local-infile-activated
  "Turn on local_infile for MySQL"
  [& body]
  `(do-with-mysql-local-infile-activated (fn [] ~@body)))

(deftest type-detection-and-parse-test
  (doseq [[string-value  expected-value expected-type seps]
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
           [(apply str (repeat 255 "x")) (apply str (repeat 255 "x")) vchar-type]
           [(apply str (repeat 256 "x")) (apply str (repeat 256 "x")) text-type]
           ["86 is my favorite number"   "86 is my favorite number"   vchar-type]
           ["My favorite number is 86"   "My favorite number is 86"   vchar-type]
           ["2022-01-01"                    #t "2022-01-01"       date-type]
           ["2022-01-01T01:00:00"           #t "2022-01-01T01:00" datetime-type]
           ["2022-01-01T01:00:00.00"        #t "2022-01-01T01:00" datetime-type]
           ["2022-01-01T01:00:00.000000000" #t "2022-01-01T01:00" datetime-type]]]
    (mt/with-temporary-setting-values [custom-formatting (when seps {:type/Number {:number_separators seps}})]
      (let [type   (upload/value->type string-value)
            parser (#'upload/upload-type->parser type)]
        (testing (format "\"%s\" is a %s" string-value type)
          (is (= expected-type
                 type)))
        (testing (format "\"%s\" is parsed into %s" string-value expected-value)
          (is (= expected-value
                 (parser string-value))))))))

(deftest ^:parallel type-coalescing-test
  (doseq [[type-a type-b expected] [[bool-type     bool-type     bool-type]
                                    [bool-type     int-type      int-type]
                                    [bool-type     date-type     vchar-type]
                                    [bool-type     datetime-type vchar-type]
                                    [bool-type     vchar-type    vchar-type]
                                    [bool-type     text-type     text-type]
                                    [int-type      bool-type     int-type]
                                    [int-type      float-type    float-type]
                                    [int-type      date-type     vchar-type]
                                    [int-type      datetime-type vchar-type]
                                    [int-type      vchar-type    vchar-type]
                                    [int-type      text-type     text-type]
                                    [float-type    vchar-type    vchar-type]
                                    [float-type    text-type     text-type]
                                    [float-type    date-type     vchar-type]
                                    [float-type    datetime-type vchar-type]
                                    [date-type     datetime-type datetime-type]
                                    [date-type     vchar-type    vchar-type]
                                    [date-type     text-type     text-type]
                                    [datetime-type vchar-type    vchar-type]
                                    [datetime-type text-type     text-type]
                                    [vchar-type    text-type     text-type]]]
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

(deftest ^:parallel detect-schema-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Well-formed CSV file"
      (is (malli= [:map
                   [:id               pk-schema]
                   [:name             [:= vchar-type]]
                   [:age              [:= int-type]]
                   [:favorite_pokemon [:= vchar-type]]]
                  (upload/detect-schema
                   driver/*driver*
                   (csv-file-with ["Name, Age, Favorite Pokémon"
                                   "Tim, 12, Haunter"
                                   "Ryan, 97, Paras"])))))
    (testing "CSV missing data"
      (is (malli= [:map
                   [:id         pk-schema]
                   [:name       [:= vchar-type]]
                   [:height     [:= int-type]]
                   [:birth_year [:= float-type]]]
             (upload/detect-schema
              driver/*driver*
              (csv-file-with ["Name, Height, Birth Year"
                              "Luke Skywalker, 172, -19"
                              "Darth Vader, 202, -41.9"
                              "Watto, 137"                              ; missing column
                              "Sebulba, 112,"])))))                     ; comma, but blank column
    (testing "Type coalescing"
      (is (malli= [:map
                   [:id         pk-schema]
                   [:name       [:= vchar-type]]
                   [:height     [:= float-type]]
                   [:birth_year [:= vchar-type]]]
             (upload/detect-schema
              driver/*driver*
              (csv-file-with ["Name, Height, Birth Year"
                              "Rey Skywalker, 170, 15"
                              "Darth Vader, 202.0, 41.9BBY"])))))
    (testing "Boolean coalescing"
      (is (malli= [:map
                   [:id            pk-schema]
                   [:name          [:= vchar-type]]
                   [:is_jedi_      [:= bool-type]]
                   [:is_jedi__int_ [:= int-type]]
                   [:is_jedi__vc_  [:= vchar-type]]]
             (upload/detect-schema
              driver/*driver*
              (csv-file-with ["Name, Is Jedi?, Is Jedi (int), Is Jedi (VC)"
                              "Rey Skywalker, yes, true, t"
                              "Darth Vader, YES, TRUE, Y"
                              "Grogu, 1, 9001, probably?"
                              "Han Solo, no, FaLsE, 0"])))))
    (testing "Order is ensured"
      (let [header "id,a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,zz,yy,xx,ww,vv,uu,tt,ss,rr,qq,pp,oo,nn,mm,ll,kk,jj,ii,hh,gg,ff,ee,dd,cc,bb,aa"]
        (is (= (map keyword (str/split header #","))
               (keys
                (upload/detect-schema
                 driver/*driver*
                 (csv-file-with [header
                                 "Luke,ah'm,yer,da,,,missing,columns,should,not,matter"])))))))
    (testing "Empty contents (with header) are okay"
      (is (malli= [:map
                   [:id       pk-schema]
                   [:name     [:= text-type]]
                   [:is_jedi_ [:= text-type]]]
             (upload/detect-schema
              driver/*driver*
              (csv-file-with ["Name, Is Jedi?"])))))
    (testing "Completely empty contents are okay"
      (is (malli= [:map
                   [:id pk-schema]]
             (upload/detect-schema
              driver/*driver*
              (csv-file-with [""])))))
    (testing "CSV missing data in the top row"
      (is (malli= [:map
                   [:id         pk-schema]
                   [:name       [:= vchar-type]]
                   [:height     [:= int-type]]
                   [:birth_year [:= float-type]]]
             (upload/detect-schema
              driver/*driver*
              (csv-file-with ["Name, Height, Birth Year"
                              ;; missing column
                              "Watto, 137"
                              "Luke Skywalker, 172, -19"
                              "Darth Vader, 202, -41.9"
                              ;; comma, but blank column
                              "Sebulba, 112,"])))))
    (testing "Existing ID column"
      (is (malli= [:map
                   [:id     pk-schema]
                   [:ship   [:= vchar-type]]
                   [:name   [:= vchar-type]]
                   [:weapon [:= vchar-type]]]
             (upload/detect-schema
              driver/*driver*
              (csv-file-with ["id,ship,name,weapon"
                              "1,Serenity,Malcolm Reynolds,Pistol"
                              "2,Millennium Falcon, Han Solo,Blaster"])))))))

(deftest ^:parallel detect-schema-dates-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (testing "Dates"
      (is (malli= [:map
                   [:id           pk-schema]
                   [:date         [:= date-type]]
                   [:not_date     [:= vchar-type]]
                   [:datetime     [:= datetime-type]]
                   [:not_datetime [:= vchar-type]]]
                  (upload/detect-schema
                   driver/*driver*
                   (csv-file-with ["Date      ,Not Date  ,Datetime           ,Not datetime       "
                                   "2022-01-01,2023-02-28,2022-01-01T00:00:00,2023-02-28T00:00:00"
                                   "2022-02-01,2023-02-29,2022-01-01T00:00:00,2023-02-29T00:00:00"])))))))
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
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id    ,nulls,string ,bool ,number       ,date      ,datetime"
                           "2\t   ,,          a ,true ,1.1\t        ,2022-01-01,2022-01-01T00:00:00"
                           "\" 3\",,           b,false,\"$ 1,000.1\",2022-02-01,2022-02-01T00:00:00"])))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name         #"(?i)upload_test"
                     :display_name "Upload Test"}
                    table))
            (is (=? {:name          #"(?i)id"
                     :semantic_type :type/PK
                     :base_type     :type/Integer}
                    (t2/select-one Field :database_position 0 :table_id (:id table))))
            (is (=? {:name      #"(?i)nulls"
                     :base_type :type/Text}
                    (t2/select-one Field :database_position 1 :table_id (:id table))))
            (is (=? {:name      #"(?i)string"
                     :base_type :type/Text}
                    (t2/select-one Field :database_position 2 :table_id (:id table))))
            (is (=? {:name      #"(?i)bool"
                     :base_type :type/Boolean}
                    (t2/select-one Field :database_position 3 :table_id (:id table))))
            (is (=? {:name      #"(?i)number"
                     :base_type :type/Float}
                    (t2/select-one Field :database_position 4 :table_id (:id table))))
            (is (=? {:name      #"(?i)date"
                     :base_type :type/Date}
                    (t2/select-one Field :database_position 5 :table_id (:id table))))
            (is (=? {:name      #"(?i)datetime"
                     :base_type (if (= driver/*driver* :mysql) :type/DateTimeWithLocalTZ :type/DateTime)}
                    (t2/select-one Field :database_position 6 :table_id (:id table))))
            (testing "Check the data was uploaded into the table"
              (is (= 2
                     (count (rows-for-table table)))))))))))

(deftest load-from-csv-date-test
  (testing "Upload a CSV file with a datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["datetime"
                           "2022-01-01"
                           "2022-01-01T00:00:00"])))
        (testing "Fields exists after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the datetime column the correct base_type"
              (is (=? {:name      #"(?i)datetime"
                       :base_type (if (= driver/*driver* :mysql) :type/DateTimeWithLocalTZ :type/DateTime)}
                      ;; db position is 1; 0 is for the auto-inserted ID
                      (t2/select-one Field :database_position 1 :table_id (:id table)))))
            (is (some? table))))))))

(deftest load-from-csv-boolean-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
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
                           "18,0"])))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the boolean column has a boolean base_type"
              (is (=? {:name      #"(?i)bool"
                       :base_type :type/Boolean}
                      (t2/select-one Field :database_position 1 :table_id (:id table)))))
            (testing "Check the data was uploaded into the table correctly"
              (let [bool-column (map second (rows-for-table table))
                    alternating (map even? (range (count bool-column)))]
                (is (= alternating bool-column))))))))))

(deftest load-from-csv-length-test
  (testing "Upload a CSV file with large names and numbers"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (let [length-limit (driver/table-name-length-limit driver/*driver*)
            long-name    (apply str (repeat 33 "abcdefgh")) ; 33×8 = 264. Max is H2 at 256
            short-name   (subs long-name 0 (- length-limit (count "_yyyyMMddHHmmss")))]
        (is (pos? length-limit) "driver/table-name-length-limit has been set")
        (mt/with-empty-db
          (with-mysql-local-infile-activated
            (upload/load-from-csv!
             driver/*driver*
             (mt/id)
             (upload/unique-table-name driver/*driver* long-name)
             (csv-file-with ["number,bool"
                             "1,true"
                             "2,false"
                             (format "%d,true" Long/MAX_VALUE)])))
          (testing "It truncates it to the right number of characters, allowing for the timestamp"
            (sync/sync-database! (mt/db))
            (let [table    (t2/select-one Table :db_id (mt/id) :%lower.name [:like (str short-name "%")])
                  table-re (re-pattern (str "(?i)" short-name "_\\d{14}"))]
              (is (re-matches table-re (:name table)))
              (testing "Check the data was uploaded into the table correctly"
                (is (= [[1 1 true]
                        [2 2 false]
                        [3 Long/MAX_VALUE true]]
                       (rows-for-table table)))))))))))

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
              (is (= ["id" "unnamed_column" "ship_name" "unnamed_column_2"]
                     (column-names-for-table table))))))))))

(deftest load-from-csv-duplicate-names-test
  (testing "Upload a CSV file with duplicate column names"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["unknown,unknown,unknown,unknown_2"
                           "1,Serenity,Malcolm Reynolds,Pistol"
                           "2,Millennium Falcon, Han Solo,Blaster"])))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["id" "unknown" "unknown_2" "unknown_3" "unknown_2_2"]
                     (column-names-for-table table))))))))))

(deftest load-from-csv-existing-id-column-test
  (testing "Upload a CSV file with an existing ID column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,ship,name,weapon"
                           "1,Serenity,Malcolm Reynolds,Pistol"
                           "2,Millennium Falcon, Han Solo,Blaster"])))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["id" "ship" "name" "weapon"]
                     (column-names-for-table table)))
              (is (=? {:name                       #"(?i)id"
                       :semantic_type              :type/PK
                       :database_is_auto_increment true}
                      (t2/select-one Field :database_position 0 :table_id (:id table)))))))))))

(deftest load-from-csv-reserved-db-words-test
  (testing "Upload a CSV file with column names that are reserved by the DB"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,ship,captain"
                           "1,Serenity,Malcolm Reynolds"
                           "2,Millennium Falcon, Han Solo"])))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["id", "ship", "captain"]
                     (column-names-for-table table))))))))))

(deftest load-from-csv-missing-values-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/with-empty-db
      (with-mysql-local-infile-activated
        (testing "Can upload a CSV with missing values"
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,column_that_doesnt_have_a_value" "2"]))
          (testing "Table and Fields exist after sync"
            (sync/sync-database! (mt/db))
            (let [table (t2/select-one Table :db_id (mt/id))]
              (is (=? {:name #"(?i)upload_test"} table))
              (testing "Check the data was uploaded into the table correctly"
                (is (= ["id", "column_that_doesnt_have_a_value"]
                       (column-names-for-table table)))
                (is (= [[2 nil]]
                       (rows-for-table table)))))))))))

(deftest load-from-csv-tab-test
  (testing "Upload a CSV file with tabs in the values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,ship,captain"
                           "1,Serenity,Malcolm\tReynolds"
                           "2,Millennium\tFalcon,Han\tSolo"])))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["id", "ship", "captain"]
                     (column-names-for-table table)))
              (is (= [[1 "Serenity" "Malcolm\tReynolds"]
                      [2 "Millennium\tFalcon" "Han\tSolo"]]
                     (rows-for-table table))))))))))

(deftest load-from-csv-carriage-return-test
  (testing "Upload a CSV file with carriage returns in the values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,ship,captain"
                           "1,Serenity,\"Malcolm\rReynolds\""
                           "2,\"Millennium\rFalcon\",\"Han\rSolo\""])))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["id", "ship", "captain"]
                     (column-names-for-table table)))
              (is (= [[1 "Serenity" "Malcolm\rReynolds"]
                      [2 "Millennium\rFalcon" "Han\rSolo"]]
                     (rows-for-table table))))))))))

(deftest load-from-csv-BOM-test
  (testing "Upload a CSV file with a byte-order mark (BOM)"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,ship,captain"
                           "1,Serenity,Malcolm Reynolds"
                           "2,Millennium Falcon, Han Solo"]
                          "star-wars"
                          (partial bom/bom-writer "UTF-8"))))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["id", "ship", "captain"]
                     (column-names-for-table table))))))))))

(deftest load-from-csv-injection-test
  (testing "Upload a CSV file with very rude values"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (with-mysql-local-infile-activated
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id integer); --,ship,captain"
                           "1,Serenity,--Malcolm Reynolds"
                           "2,;Millennium Falcon,Han Solo\""]
                          "\"; -- Very rude filename")))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["id" "id_integer_____" "ship" "captain"]
                     (column-names-for-table table)))
              (is (= [[1 1 "Serenity"           "--Malcolm Reynolds"]
                      [2 2 ";Millennium Falcon" "Han Solo\""]]
                     (rows-for-table table))))))))))

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
      (with-mysql-local-infile-activated
        (is (= "ON" (-> (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                        (jdbc/query
                         ["show global variables like 'local_infile'"])
                        first
                        :value)))))))

(deftest load-from-csv-mysql-slow-way-test
  (testing "MySQL upload should work fine with local_infile disabled"
    (mt/test-drivers [:mysql]
      (mt/with-empty-db
        (with-redefs [mysql/get-global-variable (constantly "OFF")]
          (upload/load-from-csv!
           driver/*driver*
           (mt/id)
           "upload_test"
           (csv-file-with ["id,ship,captain"
                           "1,Serenity,Malcolm Reynolds"
                           "2,Millennium Falcon,Han Solo"])))
        (testing "Table and Fields exist after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :db_id (mt/id))]
            (is (=? {:name #"(?i)upload_test"} table))
            (testing "Check the data was uploaded into the table correctly"
              (is (= ["id", "ship", "captain"]
                     (column-names-for-table table)))
              (is (= [[1 "Serenity" "Malcolm Reynolds"]
                      [2 "Millennium Falcon" "Han Solo"]]
                     (rows-for-table table))))))))))
