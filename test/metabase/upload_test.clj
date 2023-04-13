(ns metabase.upload-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.models :refer [Field Table]]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.upload :as upload]
   [toucan2.core :as t2])
  (:import
   [java.io File]))

(set! *warn-on-reflection* true)

(def bool-type      :metabase.upload/boolean)
(def int-type       :metabase.upload/int)
(def float-type     :metabase.upload/float)
(def vchar-type     :metabase.upload/varchar_255)
(def date-type      :metabase.upload/date)
(def datetime-type  :metabase.upload/datetime)
(def text-type      :metabase.upload/text)

(deftest type-detection-test
  (doseq [[value expected] [["0"                          bool-type]
                            ["1"                          bool-type]
                            ["t"                          bool-type]
                            ["T"                          bool-type]
                            ["tRuE"                       bool-type]
                            ["f"                          bool-type]
                            ["F"                          bool-type]
                            ["FAlse"                      bool-type]
                            ["Y"                          bool-type]
                            ["n"                          bool-type]
                            ["yes"                        bool-type]
                            ["NO"                         bool-type]
                            ["2"                          int-type]
                            ["-86"                        int-type]
                            ["9,986,000"                  int-type]
                            ["3.14"                       float-type]
                            [".14"                        float-type]
                            ["0.14"                       float-type]
                            ["-9,986.567"                 float-type]
                            ["9,986,000.0"                float-type]
                            [(apply str (repeat 255 "x")) vchar-type]
                            [(apply str (repeat 256 "x")) text-type]
                            ["86 is my favorite number"   vchar-type]
                            ["My favorite number is 86"   vchar-type]
                            ["2022-01-01"                 date-type]
                            ["2022-01-01T01:00:00"        datetime-type]
                            ["2022-01-01T01:00:00.00"     datetime-type]
                            ["2022-01-01T01:00:00.000000000" datetime-type]]]
    (testing (format "\"%s\" is a %s" value expected)
      (is (= expected (upload/value->type value))))))

(deftest type-coalescing-test
  (doseq [[type-a type-b expected] [[bool-type     bool-type     bool-type]
                                    [bool-type     int-type      int-type]
                                    [bool-type     date-type     vchar-type]
                                    [bool-type     datetime-type vchar-type]
                                    [bool-type     vchar-type    vchar-type] ;; ensure arg order doesn't matter
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
                                    [datetime-type text-type     text-type]]]
    (is (= expected (upload/lowest-common-ancestor type-a type-b))
        (format "%s + %s = %s" (name type-a) (name type-b) (name expected)))))

(defn csv-file-with
  "Create a temp csv file with the given content and return the file"
  ([rows]
   (csv-file-with rows "test"))
  ([rows filename]
   (let [contents (str/join "\n" rows)
         csv-file (doto (File/createTempFile filename ".csv")
                    (.deleteOnExit))]
     (spit csv-file contents)
     csv-file)))

(deftest detect-schema-test
  (testing "Well-formed CSV file"
    (is (= {"name"             vchar-type
            "age"              int-type
            "favorite_pokemon" vchar-type}
           (upload/detect-schema
            (csv-file-with ["Name, Age, Favorite Pokémon"
                            "Tim, 12, Haunter"
                            "Ryan, 97, Paras"])))))
  (testing "CSV missing data"
    (is (= {"name"       vchar-type
            "height"     int-type
            "birth_year" float-type}
           (upload/detect-schema
            (csv-file-with ["Name, Height, Birth Year"
                            "Luke Skywalker, 172, -19"
                            "Darth Vader, 202, -41.9"
                            "Watto, 137"          ; missing column
                            "Sebulba, 112,"]))))) ; comma, but blank column
  (testing "Type coalescing"
    (is (= {"name"       vchar-type
            "height"     float-type
            "birth_year" vchar-type}
           (upload/detect-schema
            (csv-file-with ["Name, Height, Birth Year"
                            "Rey Skywalker, 170, 15"
                            "Darth Vader, 202.0, 41.9BBY"])))))
  (testing "Boolean coalescing"
    (is (= {"name"          vchar-type
            "is_jedi_"      bool-type
            "is_jedi__int_" int-type
            "is_jedi__vc_"  vchar-type}
           (upload/detect-schema
            (csv-file-with ["Name, Is Jedi?, Is Jedi (int), Is Jedi (VC)"
                            "Rey Skywalker, yes, true, t"
                            "Darth Vader, YES, TRUE, Y"
                            "Grogu, 1, 9001, probably?"
                            "Han Solo, no, FaLsE, 0"])))))
  (testing "Order is ensured"
    (let [header "a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,zz,yy,xx,ww,vv,uu,tt,ss,rr,qq,pp,oo,nn,mm,ll,kk,jj,ii,hh,gg,ff,ee,dd,cc,bb,aa"]
      (is (= (str/split header #",")
             (keys
              (upload/detect-schema
               (csv-file-with [header
                               "Luke,ah'm,yer,da,,,missing,columns,should,not,matter"])))))))
  (testing "Empty contents (with header) are okay"
      (is (= {"name"     text-type
              "is_jedi_" text-type}
             (upload/detect-schema
              (csv-file-with ["Name, Is Jedi?"])))))
  (testing "Completely empty contents are okay"
      (is (= {}
             (upload/detect-schema
              (csv-file-with [""])))))
  (testing "CSV missing data in the top row"
    (is (= {"name"       vchar-type
            "height"     int-type
            "birth_year" float-type}
           (upload/detect-schema
            (csv-file-with ["Name, Height, Birth Year"
                            ;; missing column
                            "Watto, 137"
                            "Luke Skywalker, 172, -19"
                            "Darth Vader, 202, -41.9"
                            ;; comma, but blank column
                            "Sebulba, 112,"]))))))

(deftest detect-schema-dates-test
  (testing "Dates"
    (is (= {"date"         date-type
            "not_date"     vchar-type
            "datetime"     datetime-type
            "not_datetime" vchar-type}
           (upload/detect-schema
            (csv-file-with ["Date      ,Not Date  ,Datetime           ,Not datetime       "
                            "2022-01-01,2023-02-28,2022-01-01T00:00:00,2023-02-28T00:00:00"
                            "2022-02-01,2023-02-29,2022-01-01T00:00:00,2023-02-29T00:00:00"]))))))

(deftest unique-table-name-test
  (testing "File name is slugified"
    (is (=? #"my_file_name_\d+" (#'upload/unique-table-name "my file name"))))
  (testing "semicolons are removed"
    (is (nil? (re-find #";" (#'upload/unique-table-name "some text; -- DROP TABLE.csv"))))))

(deftest load-from-csv-table-name-test
  (testing "Upload a CSV file"
    (mt/test-driver (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (let [file       (csv-file-with ["id" "2" "3"])]
          (testing "Can upload two files with the same name"
            ;; Sleep for a second, because the table name is based on the current second
            (is (some? (upload/load-from-csv driver/*driver* (mt/id) "table_name" file)))
            (Thread/sleep 1000)
            (is (some? (upload/load-from-csv driver/*driver* (mt/id) "table_name" file)))))))))

(deftest load-from-csv-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (upload/load-from-csv
         driver/*driver*
         (mt/id)
         "upload_test"
         (csv-file-with ["id,nulls,string,bool,number,date,datetime"
                         "2\t ,,string,true ,1.1\t  ,2022-01-01,2022-01-01T00:00:00"
                         "   3,,string,false,    1.1,2022-02-01,2022-02-01T00:00:00"]))
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
                     :base_type :type/DateTime}
                    (t2/select-one Field :database_position 6 :table_id (:id table))))
            (testing "Check the data was uploaded into the table"
              (is (= [[2]] (-> (mt/process-query {:database (mt/id)
                                                  :type :query
                                                  :query {:source-table (:id table)
                                                          :aggregation [[:count]]}})
                               mt/rows))))))))))

(deftest load-from-csv-date-test
  (testing "Upload a CSV file with a datetime column"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (upload/load-from-csv
         driver/*driver*
         (mt/id)
         "upload_test"
         (csv-file-with ["datetime"
                         "2022-01-01"
                         "2022-01-01T00:00:00"]))
        (testing "Fields exists after sync"
          (sync/sync-database! (mt/db))
          (let [table (t2/select-one Table :name "upload_test" :db_id (mt/id))]
            (testing "Check the datetime column the correct base_type"
              (is (=? {:name      #"(?i)datetime"
                       :base_type :type/DateTime}
                      (t2/select-one Field :database_position 0 :table_id (:id table)))))
            (is (some? table))))))))

(deftest load-from-csv-boolean-test
  (testing "Upload a CSV file"
    (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
      (mt/with-empty-db
        (upload/load-from-csv
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
                      (t2/select-one Field :database_position 1 :table_id (:id table)))))
            (testing "Check the data was uploaded into the table correctly"
              (let [bool-column (->> (mt/run-mbql-query upload_test
                                       {:fields [$bool]
                                        :order-by [[:asc $id]]})
                                     mt/rows
                                     (map first))
                    alternating (map even? (range (count bool-column)))]
                (is (= alternating bool-column))))))))))

(deftest load-from-csv-failed-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/with-empty-db
      (testing "Can't upload a CSV with missing values"
        (is (thrown-with-msg?
              clojure.lang.ExceptionInfo #"Error executing write query: "
             (upload/load-from-csv
              driver/*driver*
              (mt/id)
              "upload_test"
              (csv-file-with ["id,column_that_doesnt_have_a_value" "2"])))))
      (testing "Check that the table isn't created if the upload fails"
        (sync/sync-database! (mt/db))
        (is (nil? (t2/select-one Table :db_id (mt/id))))))))
