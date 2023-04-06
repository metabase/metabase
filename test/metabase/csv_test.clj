(ns metabase.csv-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.csv :as csv]
   [metabase.driver :as driver]
   [metabase.test :as mt])
  (:import
   [java.io File]))

(set! *warn-on-reflection* true)

(def bool-type      :metabase.csv/boolean)
(def int-type       :metabase.csv/int)
(def float-type     :metabase.csv/float)
(def vchar-type     :metabase.csv/varchar_255)
(def text-type      :metabase.csv/text)

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
                            ["My favorite number is 86"   vchar-type]]]
    (testing (format "\"%s\" is a %s" value expected)
      (is (= expected (csv/value->type value))))))

(deftest type-coalescing-test
  (doseq [[type-a type-b expected] [[bool-type  int-type   int-type]
                                    [int-type   bool-type  int-type] ;; ensure arg order doesn't matter
                                    [int-type   float-type float-type]
                                    [bool-type  vchar-type vchar-type]
                                    [bool-type  text-type  text-type]
                                    [int-type   vchar-type vchar-type]
                                    [int-type   text-type  text-type]
                                    [float-type vchar-type vchar-type]
                                    [float-type text-type  text-type]
                                    [vchar-type text-type  text-type]]]
    (is (= expected (csv/coalesce type-a type-b))
        (format "%s + %s = %s" (name type-a) (name type-b) (name expected)))))

(defmacro with-temp-csv
  "Creates a temp csv file with the given `rows`. The file is deleted after the
   body is executed. This is needed instead of using File/createTempFile because Postgres might not have access to the temp directory."
  [file-name rows & body]
  `(let [csv-data# (str/join "\n" ~rows)]
     (with-open [writer# (io/writer ~file-name)]
       (.write writer# csv-data#))
     (try
       ~@body
       (finally
         (clojure.java.io/delete-file ~file-name)))))

(defn- schema-for
  [rows]
  (with-temp-csv "pokefans.csv" rows (csv/detect-schema (File. "pokefans.csv"))))

(deftest detect-schema-test
  (testing "Well-formed CSV file"
    (is (= {"name"             vchar-type
            "age"              int-type
            "favorite_pokemon" vchar-type}
           (schema-for ["Name, Age, Favorite Pokémon"
                        "Tim, 12, Haunter"
                        "Ryan, 97, Paras"]))))
  (testing "CSV missing data"
    (is (= {"name"       vchar-type
            "height"     int-type
            "birth_year" float-type}
           (schema-for ["Name, Height, Birth Year"
                        "Luke Skywalker, 172, -19"
                        "Darth Vader, 202, -41.9"
                        ;; missing column
                        "Watto, 137"
                        ;; comma, but blank column
                        "Sebulba, 112,"]))))
  (testing "Type coalescing"
    (is (= {"name"       vchar-type
            "height"     float-type
            "birth_year" vchar-type}
           (schema-for ["Name, Height, Birth Year"
                        "Rey Skywalker, 170, 15"
                        "Darth Vader, 202.0, 41.9BBY"]))))
  (testing "Boolean coalescing"
    (is (= {"name"          vchar-type
            "is_jedi_"      bool-type
            "is_jedi__int_" int-type
            "is_jedi__vc_"  vchar-type}
           (schema-for ["Name, Is Jedi?, Is Jedi (int), Is Jedi (VC)"
                        "Rey Skywalker, yes, true, t"
                        "Darth Vader, YES, TRUE, Y"
                        "Grogu, 1, 9001, probably?"
                        "Han Solo, no, FaLsE, 0"]))))
  (testing "Order is ensured"
    (let [header (str "a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,zz,yy,xx,ww,"
                      "vv,uu,tt,ss,rr,qq,pp,oo,nn,mm,ll,kk,jj,ii,hh,gg,ff,ee,dd,cc,bb,aa")]
      (is (= (str/split header #",")
             (keys
              (schema-for [header
                           "Luke,ah'm,yer,da,,,missing,columns,should,not,matter"])))))))
  (testing "Empty contents (with header) are okay"
      (is (= {"name"     text-type
              "is_jedi_" text-type}
             (schema-for ["Name, Is Jedi?"]))))
  (testing "Completely empty contents are okay"
      (is (= {}
             (schema-for [""]))))

(deftest file->table-name-test
  (testing "File name is slugified"
    (is (some? (re-find #"my_file_name_\d+" (#'csv/file->table-name (io/file "my file name.csv")))))))

(deftest load-from-csv-test
  (testing "Upload a CSV file"
    (mt/test-driver :postgres
      (mt/with-empty-db
        (with-temp-csv "pokefans.csv" ["id" "2" "3"]
          (testing "Can upload two files with the same name"
            ;; Sleep for a second, because the table name is based on the current second
            (is (some? (csv/load-from-csv driver/*driver* (mt/id) "public" (File. "pokefans.csv"))))
            (Thread/sleep 1000)
            (with-temp-csv "../pokefans.csv" ["name" "Luke" "Han"]
              (is (some? (csv/load-from-csv driver/*driver* (mt/id) "public" (File. "../pokefans.csv")))))))))))
