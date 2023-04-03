(ns metabase.csv-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.csv :as csv])
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

(defn- csv-file-with
  "Create a temp csv file with the given content and return the file"
  [rows]
  (let [contents (str/join "\n" rows)
        csv-file (File/createTempFile "pokefans" ".csv")]
    (spit csv-file contents)
    csv-file))

(deftest detect-schema-test
  (testing "Well-formed CSV file"
    (is (= {"name"             vchar-type
            "age"              int-type
            "favorite_pokemon" vchar-type}
           (csv/detect-schema
            (csv-file-with ["Name, Age, Favorite Pokémon"
                            "Tim, 12, Haunter"
                            "Ryan, 97, Paras"])))))
  (testing "CSV missing data"
    (is (= {"name"       vchar-type
            "height"     int-type
            "birth_year" float-type}
           (csv/detect-schema
            (csv-file-with ["Name, Height, Birth Year"
                            "Luke Skywalker, 172, -19"
                            "Darth Vader, 202, -41.9"
                            "Watto, 137"          ; missing column
                            "Sebulba, 112,"]))))) ; comma, but blank column
  (testing "Type coalescing"
    (is (= {"name"       vchar-type
            "height"     float-type
            "birth_year" vchar-type}
           (csv/detect-schema
            (csv-file-with ["Name, Height, Birth Year"
                            "Rey Skywalker, 170, 15"
                            "Darth Vader, 202.0, 41.9BBY"])))))
  (testing "Boolean coalescing"
    (is (= {"name"          vchar-type
            "is_jedi_"      bool-type
            "is_jedi__int_" int-type
            "is_jedi__vc_"  vchar-type}
           (csv/detect-schema
            (csv-file-with ["Name, Is Jedi?, Is Jedi (int), Is Jedi (VC)"
                            "Rey Skywalker, yes, true, t"
                            "Darth Vader, YES, TRUE, Y"
                            "Grogu, 1, 9001, probably?"
                            "Han Solo, no, FaLsE, 0"])))))
  (testing "Order is ensured"
    (let [header "a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,zz,yy,xx,ww,vv,uu,tt,ss,rr,qq,pp,oo,nn,mm,ll,kk,jj,ii,hh,gg,ff,ee,dd,cc,bb,aa"]
      (is (= (str/split header #",")
             (keys
              (csv/detect-schema
               (csv-file-with [header
                               "Luke,ah'm,yer,da,,,missing,columns,should,not,matter"])))))))
  (testing "Empty contents (with header) are okay"
      (is (= {"name"     text-type
              "is_jedi_" text-type}
             (csv/detect-schema
              (csv-file-with ["Name, Is Jedi?"])))))
  (testing "Completely empty contents are okay"
      (is (= {}
             (csv/detect-schema
              (csv-file-with [""]))))))
