(ns metabase.pulse.render.body-test
  (:require [clojure.walk :as walk]
            [expectations :refer [expect]]
            [hiccup.core :refer [html]]
            [metabase.pulse.render
             [body :as body]
             [common :as common]
             [test-util :as render.tu]])
  (:import java.util.TimeZone))

(def ^:private pacific-tz (TimeZone/getTimeZone "America/Los_Angeles"))

(def ^:private test-columns
  [{:name            "ID",
    :display_name    "ID",
    :base_type       :type/BigInteger
    :special_type    nil
    :visibility_type :normal}
   {:name            "latitude"
    :display_name    "Latitude"
    :base_type       :type/Float
    :special_type    :type/Latitude
    :visibility_type :normal}
   {:name            "last_login"
    :display_name    "Last Login"
    :base_type       :type/DateTime
    :special_type    nil
    :visibility_type :normal}
   {:name            "name"
    :display_name    "Name"
    :base_type       :type/Text
    :special_type    nil
    :visibility_type :normal}])

(def ^:private test-data
  [[1 34.0996 "2014-04-01T08:30:00.0000" "Stout Burgers & Beers"]
   [2 34.0406 "2014-12-05T15:15:00.0000" "The Apple Pan"]
   [3 34.0474 "2014-08-01T12:45:00.0000" "The Gorbals"]])

(defn- col-counts [results]
  (set (map (comp count :row) results)))

(defn- number [x]
  (common/map->NumericWrapper {:num-str x}))

(def ^:private default-header-result
  [{:row       [(number "ID") (number "Latitude") "Last Login" "Name"]
    :bar-width nil}
   #{4}])

(defn- prep-for-html-rendering'
  [cols rows bar-column max-value]
  (let [results (#'body/prep-for-html-rendering pacific-tz cols rows bar-column max-value (count cols))]
    [(first results)
     (col-counts results)]))

(def ^:private description-col {:name         "desc_col"
                                :display_name "Description Column"
                                :base_type    :type/Text
                                :special_type :type/Description
                                :visibility_type :normal})
(def ^:private detail-col      {:name            "detail_col"
                                :display_name    "Details Column"
                                :base_type       :type/Text
                                :special_type    nil
                                :visibility_type :details-only})

(def ^:private sensitive-col   {:name            "sensitive_col"
                                :display_name    "Sensitive Column"
                                :base_type       :type/Text
                                :special_type    nil
                                :visibility_type :sensitive})

(def ^:private retired-col     {:name            "retired_col"
                                :display_name    "Retired Column"
                                :base_type       :type/Text
                                :special_type    nil
                                :visibility_type :retired})

;; Testing the format of headers
(expect
  default-header-result
  (prep-for-html-rendering' test-columns test-data nil nil))

(expect
  default-header-result
  (let [cols-with-desc (conj test-columns description-col)
        data-with-desc (mapv #(conj % "Desc") test-data)]
    (prep-for-html-rendering' cols-with-desc data-with-desc nil nil)))

(expect
  default-header-result
  (let [cols-with-details (conj test-columns detail-col)
        data-with-details (mapv #(conj % "Details") test-data)]
    (prep-for-html-rendering' cols-with-details data-with-details nil nil)))

(expect
  default-header-result
  (let [cols-with-sensitive (conj test-columns sensitive-col)
        data-with-sensitive (mapv #(conj % "Sensitive") test-data)]
    (prep-for-html-rendering' cols-with-sensitive data-with-sensitive nil nil)))

(expect
  default-header-result
  (let [columns-with-retired (conj test-columns retired-col)
        data-with-retired    (mapv #(conj % "Retired") test-data)]
    (prep-for-html-rendering' columns-with-retired data-with-retired nil nil)))

;; When including a bar column, bar-width is 99%
(expect
  (assoc-in default-header-result [0 :bar-width] 99)
  (prep-for-html-rendering' test-columns test-data second 40.0))

;; When there are too many columns, #'body/prep-for-html-rendering show narrow it
(expect
  [{:row [(number "ID") (number "Latitude")]
    :bar-width 99}
   #{2}]
  (prep-for-html-rendering' (subvec test-columns 0 2) test-data second 40.0 ))

;; Basic test that result rows are formatted correctly (dates, floating point numbers etc)
(expect
  [{:bar-width nil, :row [(number "1") (number "34.10") "Apr 1, 2014" "Stout Burgers & Beers"]}
   {:bar-width nil, :row [(number "2") (number "34.04") "Dec 5, 2014" "The Apple Pan"]}
   {:bar-width nil, :row [(number "3") (number "34.05") "Aug 1, 2014" "The Gorbals"]}]
  (rest (#'body/prep-for-html-rendering pacific-tz test-columns test-data nil nil (count test-columns))))

;; Testing the bar-column, which is the % of this row relative to the max of that column
(expect
  [{:bar-width (float 85.249),  :row [(number "1") (number "34.10") "Apr 1, 2014" "Stout Burgers & Beers"]}
   {:bar-width (float 85.1015), :row [(number "2") (number "34.04") "Dec 5, 2014" "The Apple Pan"]}
   {:bar-width (float 85.1185), :row [(number "3") (number "34.05") "Aug 1, 2014" "The Gorbals"]}]
  (rest (#'body/prep-for-html-rendering pacific-tz test-columns test-data second 40 (count test-columns))))

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

;; With a remapped column, the header should contain the name of the remapped column (not the original)1
(expect
  [{:row [(number "ID") (number "Latitude") "Rating Desc" "Last Login" "Name"]
    :bar-width nil}
   #{5}]
  (prep-for-html-rendering' test-columns-with-remapping test-data-with-remapping nil nil))

;; Result rows should include only the remapped column value, not the original
(expect
  [[(number "1") (number "34.10") "Bad" "Apr 1, 2014" "Stout Burgers & Beers"]
   [(number "2") (number "34.04") "Ok" "Dec 5, 2014" "The Apple Pan"]
   [(number "3") (number "34.05") "Good" "Aug 1, 2014" "The Gorbals"]]
  (map :row (rest (#'body/prep-for-html-rendering pacific-tz test-columns-with-remapping test-data-with-remapping nil nil (count test-columns-with-remapping)))))

;; There should be no truncation warning if the number of rows/cols is fewer than the row/column limit
(expect
  ""
  (html (#'body/render-truncation-warning 100 10 100 10)))

;; When there are more rows than the limit, check to ensure a truncation warning is present
(expect
  [true false]
  (let [html-output (html (#'body/render-truncation-warning 100 10 10 100))]
    [(boolean (re-find #"Showing.*10.*of.*100.*rows" html-output))
     (boolean (re-find #"Showing .* of .* columns" html-output))]))

;; When there are more columns than the limit, check to ensure a truncation warning is present
(expect
  [true false]
  (let [html-output (html (#'body/render-truncation-warning 10 100 100 10))]
    [(boolean (re-find #"Showing.*10.*of.*100.*columns" html-output))
     (boolean (re-find #"Showing .* of .* rows" html-output))]))

(def ^:private test-columns-with-date-special-type
  (update test-columns 2 merge {:base_type    :type/Text
                                :special_type :type/DateTime}))

(expect
  [{:bar-width nil, :row [(number "1") (number "34.10") "Apr 1, 2014" "Stout Burgers & Beers"]}
   {:bar-width nil, :row [(number "2") (number "34.04") "Dec 5, 2014" "The Apple Pan"]}
   {:bar-width nil, :row [(number "3") (number "34.05") "Aug 1, 2014" "The Gorbals"]}]
  (rest (#'body/prep-for-html-rendering pacific-tz test-columns-with-date-special-type test-data nil nil (count test-columns))))

(defn- render-scalar-value [results]
  (-> (body/render :scalar nil pacific-tz nil results)
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

(defn- replace-style-maps [hiccup-map]
  (walk/postwalk (fn [maybe-map]
                   (if (and (map? maybe-map)
                            (contains? maybe-map :style))
                     :style-map
                     maybe-map)) hiccup-map))

(def ^:private render-truncation-warning'
  (comp replace-style-maps #'body/render-truncation-warning))

(expect
  nil
  (render-truncation-warning' 10 5 20 10))

(expect
  [:div :style-map
   [:div :style-map
    "Showing " [:strong :style-map "10"] " of "
    [:strong :style-map "11"] " columns."]]
  (render-truncation-warning' 10 11 20 10))

(expect
  [:div
   :style-map
   [:div :style-map "Showing "
    [:strong :style-map "20"] " of " [:strong :style-map "21"] " rows."]]
  (render-truncation-warning' 10 5 20 21))

(expect
  [:div
   :style-map
   [:div
    :style-map
    "Showing "
    [:strong :style-map "20"]
    " of "
    [:strong :style-map "21"]
    " rows and "
    [:strong :style-map "10"]
    " of "
    [:strong :style-map "11"]
    " columns."]]
  (render-truncation-warning' 10 11 20 21))

(expect
  4
  (#'body/count-displayed-columns test-columns))

(expect
  4
  (#'body/count-displayed-columns
   (concat test-columns [description-col detail-col sensitive-col retired-col])))

;; Test rendering a bar graph
;;
;; These test render the bar graph to ensure no exceptions are thrown, then look at the flattened HTML data structures
;; to see if the column names for the columns we're graphing are present in the result

(defn- flatten-html-data
  "Takes the tree-based Clojure HTML data structure and flattens it to a seq"
  [html-data]
  (tree-seq coll? seq html-data))

(defn- render-bar-graph [results]
  ;; `doall` here as the flatten won't force lazy-seqs
  (doall (flatten-html-data (body/render :bar nil pacific-tz render.tu/test-card results))))

(def ^:private default-columns
  [{:name         "Price",
    :display_name "Price",
    :base_type    :type/BigInteger
    :special_type nil}
   {:name         "NumPurchased",
    :display_name "NumPurchased",
    :base_type    :type/BigInteger
    :special_type nil}])

;; Render a bar graph with non-nil values for the x and y axis
(expect
  [true true]
  (let [result (render-bar-graph {:cols default-columns
                                  :rows [[10.0 1] [5.0 10] [2.50 20] [1.25 30]]})]
    [(some #(= "Price" %) result)
     (some #(= "NumPurchased" %) result)]))

;; Check to make sure we allow nil values for the y-axis
(expect
  [true true]
  (let [result (render-bar-graph {:cols default-columns
                                  :rows [[10.0 1] [5.0 10] [2.50 20] [1.25 nil]]})]
    [(some #(= "Price" %) result)
     (some #(= "NumPurchased" %) result)]))

;; Check to make sure we allow nil values for the y-axis
(expect
  [true true]
  (let [result (render-bar-graph {:cols default-columns
                                  :rows [[10.0 1] [5.0 10] [2.50 20] [nil 30]]})]
    [(some #(= "Price" %) result)
     (some #(= "NumPurchased" %) result)]))

;; Check to make sure we allow nil values for both x and y on different rows
(expect
  [true true]
  (let [result (render-bar-graph {:cols default-columns
                                  :rows [[10.0 1] [5.0 10] [nil 20] [1.25 nil]]})]
    [(some #(= "Price" %) result)
     (some #(= "NumPurchased" %) result)]))

;; Test rendering a sparkline
;;
;; Sparklines are a binary image either in-line or as an attachment, so there's not much introspection that we can do
;; with the result. The tests below just check that we can render a sparkline (without eceptions) and that the
;; attachment is included

(defn- render-sparkline [results]
  (some-> (body/render :sparkline :attachment pacific-tz render.tu/test-card results)
          :attachments
          count))

;; Test that we can render a sparkline with all valid values
(expect
  1
  (render-sparkline
   {:cols default-columns
    :rows [[10.0 1] [5.0 10] [2.50 20] [1.25 30]]}))

;; Tex that we can have a nil value in the middle
(expect
  1
  (render-sparkline
   {:cols default-columns
    :rows [[10.0 1] [11.0 2] [5.0 nil] [2.50 20] [1.25 30]]}))

;; Test that we can have a nil value for the y-axis at the end of the results
(expect
  1
  (render-sparkline
   {:cols default-columns
    :rows [[10.0 1] [11.0 2] [2.50 20] [1.25 nil]]}))

;; Test that we can have a nil value for the x-axis at the end of the results
(expect
  1
  (render-sparkline
   {:cols default-columns
    :rows [[10.0 1] [11.0 2] [nil 20] [1.25 30]]}))

;; Test that we can have a nil value for both x and y axis for different rows
(expect
  1
  (render-sparkline
   {:cols default-columns
    :rows [[10.0 1] [11.0 2] [nil 20] [1.25 nil]]}))
