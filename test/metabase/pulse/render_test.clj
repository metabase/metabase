(ns metabase.pulse.render-test
  (:require [expectations :refer :all]
            [hiccup.core :refer [html]]
            [metabase.pulse.render :refer :all]
            [metabase.test.util :as tu])
  (:import java.util.TimeZone))

(tu/resolve-private-vars metabase.pulse.render prep-for-html-rendering render-truncation-warning render:scalar)

(def pacific-tz (TimeZone/getTimeZone "America/Los_Angeles"))

(def ^:private test-columns
  [{:name         "ID",
    :display_name "ID",
    :base_type    :type/BigInteger
    :special_type nil}
   {:name         "latitude"
    :display_name "Latitude"
    :base-type    :type/Float
    :special-type :type/Latitude}
   {:name         "last_login"
    :display_name "Last Login"
    :base_type    :type/DateTime
    :special_type nil}
   {:name         "name"
    :display_name "Name"
    :base-type    :type/Text
    :special_type nil}])

(def ^:private test-data
  [[1 34.0996 "2014-04-01T08:30:00.0000" "Stout Burgers & Beers"]
   [2 34.0406 "2014-12-05T15:15:00.0000" "The Apple Pan"]
   [3 34.0474 "2014-08-01T12:45:00.0000" "The Gorbals"]])

;; Testing the format of headers
(expect
  {:row ["ID" "LATITUDE" "LAST LOGIN" "NAME"]
   :bar-width nil}
  (first (prep-for-html-rendering pacific-tz test-columns test-data nil nil (count test-columns))))

;; When including a bar column, bar-width is 99%
(expect
  {:row ["ID" "LATITUDE" "LAST LOGIN" "NAME"]
   :bar-width 99}
  (first (prep-for-html-rendering pacific-tz test-columns test-data second 40.0 (count test-columns))))

;; When there are too many columns, prep-for-html-rendering show narrow it
(expect
  {:row ["ID" "LATITUDE"]
   :bar-width 99}
  (first (prep-for-html-rendering pacific-tz test-columns test-data second 40.0 2)))

;; Basic test that result rows are formatted correctly (dates, floating point numbers etc)
(expect
  [{:bar-width nil, :row ["1" "34.10" "Apr 1, 2014" "Stout Burgers & Beers"]}
   {:bar-width nil, :row ["2" "34.04" "Dec 5, 2014" "The Apple Pan"]}
   {:bar-width nil, :row ["3" "34.05" "Aug 1, 2014" "The Gorbals"]}]
  (rest (prep-for-html-rendering pacific-tz test-columns test-data nil nil (count test-columns))))

;; Testing the bar-column, which is the % of this row relative to the max of that column
(expect
  [{:bar-width (float 85.249),  :row ["1" "34.10" "Apr 1, 2014" "Stout Burgers & Beers"]}
   {:bar-width (float 85.1015), :row ["2" "34.04" "Dec 5, 2014" "The Apple Pan"]}
   {:bar-width (float 85.1185), :row ["3" "34.05" "Aug 1, 2014" "The Gorbals"]}]
  (rest (prep-for-html-rendering pacific-tz test-columns test-data second 40 (count test-columns))))

(defn- add-rating
  "Injects `RATING-OR-COL` and `DESCRIPTION-OR-COL` into `COLUMNS-OR-ROW`"
  [columns-or-row rating-or-col description-or-col]
  (vec
   (concat (subvec columns-or-row 0 2)
           [rating-or-col]
           (subvec columns-or-row 2)
           [description-or-col])))

(def ^:private test-columns-with-remapping
  (add-rating test-columns
              {:name         "rating"
               :display_name "Rating"
               :base_type    :type/Integer
               :special_type :type/Category
               :remapped_to  "rating_desc"}
              {:name          "rating_desc"
               :display_name  "Rating Desc"
               :base_type     :type/Text
               :special_type  nil
               :remapped_from "rating"}))

(def ^:private test-data-with-remapping
  (mapv add-rating
        test-data
        [1 2 3]
        ["Bad" "Ok" "Good"]))

;; With a remapped column, the header should contain the name of the remapped column (not the original)
(expect
  {:row ["ID" "LATITUDE" "RATING DESC" "LAST LOGIN" "NAME"]
   :bar-width nil}
  (first (prep-for-html-rendering pacific-tz test-columns-with-remapping test-data-with-remapping nil nil (count test-columns-with-remapping))))

;; Result rows should include only the remapped column value, not the original
(expect
  [["1" "34.10" "Bad" "Apr 1, 2014" "Stout Burgers & Beers"]
   ["2" "34.04" "Ok" "Dec 5, 2014" "The Apple Pan"]
   ["3" "34.05" "Good" "Aug 1, 2014" "The Gorbals"]]
  (map :row (rest (prep-for-html-rendering pacific-tz test-columns-with-remapping test-data-with-remapping nil nil (count test-columns-with-remapping)))))

;; There should be no truncation warning if the number of rows/cols is fewer than the row/column limit
(expect
  ""
  (html (render-truncation-warning 100 10 100 10)))

;; When there are more rows than the limit, check to ensure a truncation warning is present
(expect
  [true false]
  (let [html-output (html (render-truncation-warning 100 10 10 100))]
    [(boolean (re-find #"Showing.*10.*of.*100.*rows" html-output))
     (boolean (re-find #"Showing .* of .* columns" html-output))]))

;; When there are more columns than the limit, check to ensure a truncation warning is present
(expect
  [true false]
  (let [html-output (html (render-truncation-warning 10 100 100 10))]
    [(boolean (re-find #"Showing.*10.*of.*100.*columns" html-output))
     (boolean (re-find #"Showing .* of .* rows" html-output))]))

(def ^:private test-columns-with-date-special-type
  (update test-columns 2 merge {:base_type    :type/Text
                                :special_type :type/DateTime}))

(expect
  [{:bar-width nil, :row ["1" "34.10" "Apr 1, 2014" "Stout Burgers & Beers"]}
   {:bar-width nil, :row ["2" "34.04" "Dec 5, 2014" "The Apple Pan"]}
   {:bar-width nil, :row ["3" "34.05" "Aug 1, 2014" "The Gorbals"]}]
  (rest (prep-for-html-rendering pacific-tz test-columns-with-date-special-type test-data nil nil (count test-columns))))

(defn- render-scalar-value [results]
  (-> (render:scalar pacific-tz nil results)
      :content
      last))

(expect
  "10"
  (render-scalar-value {:cols [{:name         "ID",
                                :display_name "ID",
                                :base_type    :type/BigInteger
                                :special_type nil}]
                        :rows [[10]]}))

(expect
  "10.12"
  (render-scalar-value {:cols [{:name         "floatnum",
                                :display_name "FLOATNUM",
                                :base_type    :type/Float
                                :special_type nil}]
                        :rows [[10.12345]]}))

(expect
  "foo"
  (render-scalar-value {:cols [{:name         "stringvalue",
                                :display_name "STRINGVALUE",
                                :base_type    :type/Text
                                :special_type nil}]
                        :rows [["foo"]]}))
(expect
  "Apr 1, 2014"
  (render-scalar-value {:cols [{:name         "date",
                                :display_name "DATE",
                                :base_type    :type/DateTime
                                :special_type nil}]
                        :rows [["2014-04-01T08:30:00.0000"]]}))
