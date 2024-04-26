(ns metabase.pulse.render.body-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [hiccup.core :refer [html]]
   [hickory.select :as hik.s]
   [metabase.formatter :as formatter]
   [metabase.models :refer [Card]]
   [metabase.pulse.render.body :as body]
   [metabase.pulse.render.test-util :as render.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [toucan2.core :as t2]))

(use-fixtures :each
  (fn warn-possible-rebuild
    [thunk]
    (testing "[PRO TIP] If this test fails, you may need to rebuild the bundle with `yarn build-static-viz`\n"
      (thunk))))

(def ^:private pacific-tz "America/Los_Angeles")

(def ^:private test-columns
  [{:name            "ID",
    :display_name    "ID",
    :base_type       :type/BigInteger
    :semantic_type   nil
    :visibility_type :normal}
   {:name            "latitude"
    :display_name    "Latitude"
    :base_type       :type/Float
    :semantic_type   :type/Latitude
    :visibility_type :normal}
   {:name            "last_login"
    :display_name    "Last Login"
    :base_type       :type/DateTime
    :semantic_type   nil
    :visibility_type :normal}
   {:name            "name"
    :display_name    "Name"
    :base_type       :type/Text
    :semantic_type   nil
    :visibility_type :normal}])

(def ^:private example-test-data
  [[1 34.0996 "2014-04-01T08:30:00.0000" "Stout Burgers & Beers"]
   [2 34.0406 "2014-12-05T15:15:00.0000" "The Apple Pan"]
   [3 34.0474 "2014-08-01T12:45:00.0000" "The Gorbals"]
   [4 0       "2018-09-01T19:32:00.0000" "The Tipsy Tardigrade"]
   [5 nil     "2022-10-12T05:55:00.0000" "The Bungalow"]])

(defn- col-counts [results]
  (set (map (comp count :row) results)))

(defn- number [num-str num-value]
  (formatter/map->NumericWrapper {:num-str   (str num-str)
                                  :num-value num-value}))

(def ^:private default-header-result
  [{:row       [(number "ID" "ID") (number "Latitude" "Latitude") "Last Login" "Name"]
    :bar-width nil}
   #{4}])

(defn- prep-for-html-rendering'
  [cols rows bar-column min-value max-value]
  (let [results (#'body/prep-for-html-rendering pacific-tz {} {:cols cols :rows rows}
                                                {:bar-column bar-column :min-value min-value :max-value max-value})]
    [(first results)
     (col-counts results)]))

(def ^:private description-col {:name         "desc_col"
                                :display_name "Description Column"
                                :base_type    :type/Text
                                :semantic_type :type/Description
                                :visibility_type :normal})
(def ^:private detail-col      {:name            "detail_col"
                                :display_name    "Details Column"
                                :base_type       :type/Text
                                :semantic_type    nil
                                :visibility_type :details-only})

(def ^:private sensitive-col   {:name            "sensitive_col"
                                :display_name    "Sensitive Column"
                                :base_type       :type/Text
                                :semantic_type    nil
                                :visibility_type :sensitive})

(def ^:private retired-col     {:name            "retired_col"
                                :display_name    "Retired Column"
                                :base_type       :type/Text
                                :semantic_type    nil
                                :visibility_type :retired})

;; Testing the format of headers
(deftest header-result
  (is (= default-header-result
         (prep-for-html-rendering' test-columns example-test-data nil nil nil))))

(deftest header-result-2
  (let [cols-with-desc (conj test-columns description-col)
        data-with-desc (mapv #(conj % "Desc") example-test-data)]
    (is (= default-header-result
           (prep-for-html-rendering' cols-with-desc data-with-desc nil nil nil)))))

(deftest header-result-3
  (let [cols-with-details (conj test-columns detail-col)
        data-with-details (mapv #(conj % "Details") example-test-data)]
    (is (= default-header-result
           (prep-for-html-rendering' cols-with-details data-with-details nil nil nil)))))

(deftest header-result-4
  (let [cols-with-sensitive (conj test-columns sensitive-col)
        data-with-sensitive (mapv #(conj % "Sensitive") example-test-data)]
    (is (= default-header-result
           (prep-for-html-rendering' cols-with-sensitive data-with-sensitive nil nil nil)))))

(deftest header-result-5
  (let [columns-with-retired (conj test-columns retired-col)
        data-with-retired    (mapv #(conj % "Retired") example-test-data)]
    (is (= default-header-result
           (prep-for-html-rendering' columns-with-retired data-with-retired nil nil nil)))))

(deftest prefers-col-visualization-settings-for-header
  (testing "Users can give columns custom names. Use those if they exist."
    (let [card    {:visualization_settings
                   {:column_settings {"[\"ref\",[\"field\",321,null]]" {:column_title "Custom Last Login"}
                                      "[\"name\",\"name\"]"            {:column_title "Custom Name"}}}}
          cols    [{:name            "last_login"
                    :display_name    "Last Login"
                    :base_type       :type/DateTime
                    :semantic_type    nil
                    :visibility_type :normal
                    :field_ref       [:field 321 nil]}
                   {:name            "name"
                    :display_name    "Name"
                    :base_type       :type/Text
                    :semantic_type    nil
                    :visibility_type :normal}]]

      (testing "card contains custom column names"
        (is (= {:row       ["Custom Last Login" "Custom Name"]
                :bar-width nil}
               (first (#'body/prep-for-html-rendering pacific-tz
                                                      card
                                                      {:cols cols :rows []})))))

      (testing "card does not contain custom column names"
        (is (= {:row       ["Last Login" "Name"]
                :bar-width nil}
               (first (#'body/prep-for-html-rendering pacific-tz
                                                      {}
                                                      {:cols cols :rows []}))))))))

;; When including a bar column, bar-width is 99%
(deftest bar-width
  (is (= (assoc-in default-header-result [0 :bar-width] 99)
         (prep-for-html-rendering' test-columns example-test-data second 0 40.0))))

;; When there are too many columns, #'body/prep-for-html-rendering show narrow it
(deftest narrow-the-columns
  (is (= [{:row [(number "ID" "ID") (number "Latitude" "Latitude")]
           :bar-width 99}
          #{2}]
         (prep-for-html-rendering' (subvec test-columns 0 2) example-test-data second 0 40.0))))

;; Basic test that result rows are formatted correctly (dates, floating point numbers etc)
(deftest format-result-rows
  (is (= [{:bar-width nil, :row [(number "1" 1) "34.09960000° N" "April 1, 2014, 8:30 AM" "Stout Burgers & Beers"]}
          {:bar-width nil, :row [(number "2" 2) "34.04060000° N" "December 5, 2014, 3:15 PM" "The Apple Pan"]}
          {:bar-width nil, :row [(number "3" 3) "34.04740000° N" "August 1, 2014, 12:45 PM" "The Gorbals"]}
          {:bar-width nil, :row [(number "4" 4)  "0.00000000° N" "September 1, 2018, 7:32 PM" "The Tipsy Tardigrade"]}
          {:bar-width nil, :row [(number "5" 5) "" "October 12, 2022, 5:55 AM" "The Bungalow"]}]
         (rest (#'body/prep-for-html-rendering pacific-tz {} {:cols test-columns :rows example-test-data})))))

;; Testing the bar-column, which is the % of this row relative to the max of that column
(deftest bar-column
  (is (= [{:bar-width (float 85.249), :row [(number "1" 1) "34.09960000° N" "April 1, 2014, 8:30 AM" "Stout Burgers & Beers"]}
          {:bar-width (float 85.1015), :row [(number "2" 2) "34.04060000° N" "December 5, 2014, 3:15 PM" "The Apple Pan"]}
          {:bar-width (float 85.1185), :row [(number "3" 3) "34.04740000° N" "August 1, 2014, 12:45 PM" "The Gorbals"]}
          {:bar-width (float 0.0), :row [(number "4" 4) "0.00000000° N" "September 1, 2018, 7:32 PM" "The Tipsy Tardigrade"]}
          {:bar-width nil, :row [(number "5" 5) "" "October 12, 2022, 5:55 AM" "The Bungalow"]}]
         (rest (#'body/prep-for-html-rendering pacific-tz {} {:cols test-columns :rows example-test-data}
                 {:bar-column second, :min-value 0, :max-value 40})))))

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
               :semantic_type :type/Category
               :remapped_to  "rating_desc"}
              {:name          "rating_desc"
               :display_name  "Rating Desc"
               :base_type     :type/Text
               :semantic_type  nil
               :remapped_from "rating"}))

(def ^:private test-data-with-remapping
  (mapv add-rating
        example-test-data
        [1 2 3]
        ["Bad" "Ok" "Good"]))

;; With a remapped column, the header should contain the name of the remapped column (not the original)1
(deftest remapped-col
  (is (= [{:row [(number "ID" "ID") (number "Latitude" "Latitude") "Rating Desc" "Last Login" "Name"]
           :bar-width nil}
          #{5}]
         (prep-for-html-rendering' test-columns-with-remapping test-data-with-remapping nil nil nil))))

;; Result rows should include only the remapped column value, not the original
(deftest include-only-remapped-column-name
  (is (= [[(number "1" 1) "34.09960000° N" "Bad" "April 1, 2014, 8:30 AM" "Stout Burgers & Beers"]
          [(number "2" 2) "34.04060000° N" "Ok" "December 5, 2014, 3:15 PM" "The Apple Pan"]
          [(number "3" 3) "34.04740000° N" "Good" "August 1, 2014, 12:45 PM" "The Gorbals"]]
         (map :row (rest (#'body/prep-for-html-rendering pacific-tz
                           {}
                           {:cols test-columns-with-remapping :rows test-data-with-remapping}))))))

;; There should be no truncation warning if the number of rows/cols is fewer than the row/column limit
(deftest no-truncation-warnig
  (is (= ""
         (html (#'body/render-truncation-warning 100 10)))))

;; When there are more rows than the limit, check to ensure a truncation warning is present
(deftest truncation-warning-when-rows-exceed-max
  (is (= true
         (let [html-output (html (#'body/render-truncation-warning 10 100))]
           (boolean (re-find #"Showing.*10.*of.*100.*rows" html-output))))))

(def ^:private test-columns-with-date-semantic-type
  (update test-columns 2 merge {:base_type    :type/Text
                                :effective_type :type/DateTime
                                :coercion_strategy :Coercion/ISO8601->DateTime}))

(deftest cols-with-semantic-types
  (is (= [{:bar-width nil, :row [(number "1" 1) "34.09960000° N" "April 1, 2014, 8:30 AM" "Stout Burgers & Beers"]}
          {:bar-width nil, :row [(number "2" 2) "34.04060000° N" "December 5, 2014, 3:15 PM" "The Apple Pan"]}
          {:bar-width nil, :row [(number "3" 3) "34.04740000° N" "August 1, 2014, 12:45 PM" "The Gorbals"]}
          {:bar-width nil, :row [(number "4" 4) "0.00000000° N" "September 1, 2018, 7:32 PM" "The Tipsy Tardigrade"]}
          {:bar-width nil, :row [(number "5" 5) "" "October 12, 2022, 5:55 AM" "The Bungalow"]}]
         (rest (#'body/prep-for-html-rendering pacific-tz
                 {}
                 {:cols test-columns-with-date-semantic-type :rows example-test-data})))))

(deftest error-test
  (testing "renders error"
    (is (= "An error occurred while displaying this card."
           (-> (body/render :render-error nil nil nil nil nil) :content last))))
  (testing "renders card error"
    (is (= "There was a problem with this question."
           (-> (body/render :card-error nil nil nil nil nil) :content last)))))

(defn- render-scalar-value [results]
  (-> (body/render :scalar nil pacific-tz nil nil results)
      :content
      last))

(deftest scalar-test
  (testing "renders int"
    (is (= "10"
           (render-scalar-value {:cols [{:name         "ID",
                                         :display_name "ID",
                                         :base_type    :type/BigInteger
                                         :semantic_type nil}]
                                 :rows [[10]]}))))
  (testing "renders float"
    (is (= "10.12"
           (render-scalar-value {:cols [{:name         "floatnum",
                                         :display_name "FLOATNUM",
                                         :base_type    :type/Float
                                         :semantic_type nil}]
                                 :rows [[10.12345]]}))))
  (testing "renders string"
    (is (= "foo"
           (render-scalar-value {:cols [{:name         "stringvalue",
                                         :display_name "STRINGVALUE",
                                         :base_type    :type/Text
                                         :semantic_type nil}]
                                 :rows [["foo"]]}))))
  (testing "renders date"
    (is (= "April 1, 2014, 8:30 AM"
           (render-scalar-value {:cols [{:name         "date",
                                         :display_name "DATE",
                                         :base_type    :type/DateTime
                                         :semantic_type nil}]
                                 :rows [["2014-04-01T08:30:00.0000"]]}))))
  (testing "Includes raw text"
    (testing "for scalars"
      (let [results {:cols [{:name         "stringvalue",
                             :display_name "STRINGVALUE",
                             :base_type    :type/Text
                             :semantic_type nil}]
                     :rows [["foo"]]}]
        (is (= "foo"
               (:render/text (body/render :scalar nil pacific-tz nil nil results))))
        (is (=? {:attachments nil
                 :content     [:div
                               {:style string?}
                               "foo"]
                 :render/text "foo"}
                (body/render :scalar nil pacific-tz nil nil results)))))
    (testing "for smartscalars"
      (let [cols    [{:name         "value",
                      :display_name "VALUE",
                      :base_type    :type/Decimal}
                     {:name           "time",
                      :display_name   "TIME",
                      :base_type      :type/DateTime
                      :effective_type :type/DateTime}]
            results {:cols cols
                     :rows [[40.0 :this-month]
                            [30.0 :last-month]
                            [20.0 :month-before]]
                     :insights [{:previous-value 30.0
                                 :unit :month
                                 :last-change 1.333333
                                 :col "value"
                                 :last-value 40.0}]}
            sameres {:cols cols
                     :rows [[40.0 :this-month]
                            [40.0 :last-month]
                            [40.0 :month-before]]
                     :insights [{:previous-value 40.0
                                 :unit :month
                                 :last-change 1.0
                                 :col "value"
                                 :last-value 40.0}]}
            ;; by "dumb" it is meant "without nonnil insights"
            dumbres {:cols cols
                     :rows [[20.0 :month-before]]
                     :insights [{:previous-value nil
                                 :unit nil
                                 :last-change nil
                                 :col "value"
                                 :last-value 20.0}]}]
        (is (= "40\nUp 133.33% vs. previous month: 30"
               (:render/text (body/render :smartscalar nil pacific-tz nil nil results))))
        (is (= "40\nNo change vs. previous month: 40"
               (:render/text (body/render :smartscalar nil pacific-tz nil nil sameres))))
        (is (= "20\nNothing to compare to."
               (:render/text (body/render :smartscalar nil pacific-tz nil nil dumbres))))
        (is (=? {:attachments nil
                 :content     vector?
                 :render/text "40\nUp 133.33% vs. previous month: 30"}
                (body/render :smartscalar nil pacific-tz nil nil results)))))))

(defn- replace-style-maps [hiccup-map]
  (walk/postwalk (fn [maybe-map]
                   (if (and (map? maybe-map)
                            (contains? maybe-map :style))
                     :style-map
                     maybe-map)) hiccup-map))

(def ^:private render-truncation-warning'
  (comp replace-style-maps #'body/render-truncation-warning))

(deftest no-truncation-warnig-for-style
  (is (nil? (render-truncation-warning' 10 5))))

(deftest renders-truncation
  (is (= [:div
          :style-map
          [:div :style-map "Showing "
           [:strong :style-map "20"] " of " [:strong :style-map "21"] " rows."]]
         (render-truncation-warning' 20 21))))

;; Test rendering a bar graph
;;
;; These test render the bar graph to ensure no exceptions are thrown, then look at the flattened HTML data structures
;; to see if the column names for the columns we're graphing are present in the result

(defn- flatten-html-data
  "Takes the tree-based Clojure HTML data structure and flattens it to a seq"
  [html-data]
  (tree-seq coll? seq html-data))

(def ^:private default-columns
  [{:name         "Price",
    :display_name "Price",
    :base_type    :type/BigInteger
    :semantic_type nil}
   {:name         "NumPurchased",
    :display_name "NumPurchased",
    :base_type    :type/BigInteger
    :semantic_type nil}])

(def ^:private default-multi-columns
  [{:name         "Price",
    :display_name "Price",
    :base_type    :type/BigInteger
    :semantic_type nil}
   {:name         "NumPurchased",
    :display_name "NumPurchased",
    :base_type    :type/BigInteger
    :semantic_type nil}
   {:name         "NumKazoos",
    :display_name "NumKazoos",
    :base_type    :type/BigInteger
    :semantic_type nil}
   {:name         "ExtraneousColumn",
    :display_name "ExtraneousColumn",
    :base_type    :type/BigInteger
    :semantic_type nil}])

(defn has-inline-image? [rendered]
  (some #{:img} (flatten-html-data rendered)))

(defn- render-bar-graph [results]
  (body/render :bar :inline pacific-tz render.tu/test-card nil results))

(defn- render-multiseries-bar-graph [results]
  (body/render :bar :inline pacific-tz render.tu/test-combo-card nil results))

(deftest render-bar-graph-test
  (testing "Render a bar graph with non-nil values for the x and y axis"
    (is (has-inline-image?
         (render-bar-graph {:cols         default-columns
                            :rows         [[10.0 1] [5.0 10] [2.50 20] [1.25 30]]
                            :viz-settings {:graph.metrics ["NumPurchased"]}}))))
  (testing "Check to make sure we allow nil values for the y-axis"
    (is (has-inline-image?
         (render-bar-graph {:cols         default-columns
                            :rows         [[10.0 1] [5.0 10] [2.50 20] [1.25 nil]]
                            :viz-settings {:graph.metrics ["NumPurchased"]}}))))
  (testing "Check to make sure we allow nil values for the x-axis"
    (let [graph (render-bar-graph {:cols         default-columns
                                   :rows         [[10.0 1] [5.0 10] [2.50 20] [nil 30]]
                                   :viz-settings {:graph.metrics ["NumPurchased"]}})]
      (is (has-inline-image? graph))
      (is (= graph
             (render-bar-graph {:cols         default-columns
                                :rows         [[10.0 1] [5.0 10] [2.50 20] ["(empty)" 30]]
                                :viz-settings {:graph.metrics ["NumPurchased"]}})))))
  (testing "Check to make sure we allow nil values for both x and y on different rows"
    (is (has-inline-image?
         (render-bar-graph {:cols         default-columns
                            :rows         [[10.0 1] [5.0 10] [nil 20] [1.25 nil]]
                            :viz-settings {:graph.metrics ["NumPurchased"]}}))))
  (testing "Check multiseries in one card but without explicit combo"
    (is (has-inline-image?
         (render-multiseries-bar-graph
          {:cols         default-multi-columns
           :rows         [[10.0 1 1231 1] [5.0 10 nil 111] [2.50 20 11 1] [1.25 nil 1231 11]]
           :viz-settings {:graph.metrics ["NumPurchased"]}})))))

(defn- render-area-graph [results]
  (body/render :area :inline pacific-tz render.tu/test-card nil results))

(defn- render-stack-area-graph [results]
  (body/render :area :inline pacific-tz render.tu/test-stack-card nil results))

(defn- render-multiseries-area-graph [results]
  (body/render :area :inline pacific-tz render.tu/test-combo-card nil results))

(deftest render-area-graph-test
  (testing "Render an area graph with non-nil values for the x and y axis"
    (is (has-inline-image?
         (render-area-graph {:cols         default-columns
                             :rows         [[10.0 1] [5.0 10] [2.50 20] [1.25 30]]
                             :viz-settings {:graph.metrics ["NumPurchased"]}}))))
  (testing "Render a stacked area graph"
    (is (has-inline-image?
         (render-stack-area-graph {:cols         default-multi-columns
                                   :rows         [[10.0 1 1231 1] [5.0 10 nil 111] [2.50 20 11 1] [1.25 nil 1231 11]]
                                   :viz-settings {:graph.metrics ["NumPurchased"]}}))))
  (testing "Check to make sure we allow nil values for the y-axis"
    (is (has-inline-image?
         (render-area-graph {:cols         default-columns
                             :rows         [[10.0 1] [5.0 10] [2.50 20] [1.25 nil]]
                             :viz-settings {:graph.metrics ["NumPurchased"]}}))))
  (testing "Check to make sure we allow nil values for the y-axis"
    (is (has-inline-image?
         (render-area-graph {:cols         default-columns
                             :rows         [[10.0 1] [5.0 10] [2.50 20] [nil 30]]
                             :viz-settings {:graph.metrics ["NumPurchased"]}}))))
  (testing "Check to make sure we allow nil values for both x and y on different rows"
    (is (has-inline-image?
         (render-area-graph {:cols         default-columns
                             :rows         [[10.0 1] [5.0 10] [nil 20] [1.25 nil]]
                             :viz-settings {:graph.metrics ["NumPurchased"]}}))))
  (testing "Check multiseries in one card but without explicit combo"
    (is (has-inline-image?
         (render-multiseries-area-graph
          {:cols         default-multi-columns
           :rows         [[10.0 1 1231 1] [5.0 10 nil 111] [2.50 20 11 1] [1.25 nil 1231 11]]
           :viz-settings {:graph.metrics ["NumPurchased"]}})))))

(defn- render-waterfall [results]
  (body/render :waterfall :inline pacific-tz render.tu/test-card nil results))

(deftest render-waterfall-test
  (testing "Render a waterfall graph with non-nil values for the x and y axis"
    (is (has-inline-image?
         (render-waterfall {:cols default-columns
                            :rows         [[10.0 1] [5.0 10] [2.50 20] [1.25 30]]
                            :viz-settings {}}))))
  (testing "Render a waterfall graph with bigdec, bigint values for the x and y axis"
    (is (has-inline-image?
         (render-waterfall {:cols         default-columns
                            :rows         [[10.0M 1M] [5.0 10N] [2.50 20N] [1.25M 30]]
                            :viz-settings {}}))))
  (testing "Check to make sure we allow nil values for the y-axis"
    (is (has-inline-image?
         (render-waterfall {:cols         default-columns
                            :rows         [[10.0 1] [5.0 10] [2.50 20] [1.25 nil]]
                            :viz-settings {}}))))
  (testing "Check to make sure we allow nil values for the x-axis"
    (is (has-inline-image?
         (render-waterfall {:cols         default-columns
                            :rows         [[10.0 1] [5.0 10] [2.50 20] [nil 30]]
                            :viz-settings {}}))))
  (testing "Check to make sure we allow nil values for both x and y on different rows"
    (is (has-inline-image?
         (render-waterfall {:cols         default-columns
                            :rows         [[10.0 1] [5.0 10] [nil 20] [1.25 nil]]
                            :viz-settings {}})))))

(defn- render-combo [results]
  (body/render :combo :inline pacific-tz render.tu/test-combo-card nil results))

(defn- render-combo-multi-x [results]
  (body/render :combo :inline pacific-tz render.tu/test-combo-card-multi-x nil results))

(deftest render-combo-test
  (testing "Render a combo graph with non-nil values for the x and y axis"
    (is (has-inline-image?
         (render-combo {:cols         default-multi-columns
                        :rows         [[10.0 1 123 111] [5.0 10 12 111] [2.50 20 1337 12312] [1.25 30 -22 123124]]
                        :viz-settings {:graph.metrics ["NumPurchased" "NumKazoos" "ExtraneousColumn"]}}))))
  (testing "Render a combo graph with multiple x axes"
    (is (has-inline-image?
         (render-combo-multi-x {:cols         default-multi-columns
                                :rows         [[10.0 "Bob" 123 123124] [5.0 "Dobbs" 12 23423] [2.50 "Robbs" 1337 234234] [1.25 "Mobbs" -22 1234123]]}))))
  (testing "Check to make sure we allow nil values for any axis"
    (is (has-inline-image?
         (render-combo {:cols         default-multi-columns
                        :rows         [[nil 1 1 23453] [10.0 1 nil nil] [5.0 10 22 1337] [2.50 nil 22 1231] [1.25 nil nil 1231232]]
                        :viz-settings {:graph.metrics ["NumPurchased" "NumKazoos" "ExtraneousColumn"]}})))))

(defn- render-funnel [results]
  (body/render :funnel :inline pacific-tz render.tu/test-card nil results))

(deftest render-funnel-test
  (testing "Test that we can render a funnel with all valid values"
    (is (has-inline-image?
         (render-funnel
          {:cols         default-columns
           :rows         [[10.0 1] [5.0 10] [2.50 20] [1.25 30]]
           :viz-settings {}}))))
  (testing "Test that we can render a funnel with extraneous columns and also weird strings stuck in places"
    (is (has-inline-image?
         (render-funnel
          {:cols         default-multi-columns
           :rows         [[10.0 1 2 2] [5.0 10 "11.1" 1] ["2.50" 20 1337 0] [1.25 30 -2 "-2"]]
           :viz-settings {}}))))
  (testing "Test that we can have some nil values stuck everywhere"
    (is (has-inline-image?
         (render-funnel
          {:cols         default-columns
           :rows         [[nil 1] [11.0 nil] [nil nil] [2.50 20] [1.25 30]]
           :viz-settings {}})))))

(defn- render-error?
  [pulse-body]
  (let [content (get-in pulse-body [0 :content 0 :content])]
    (str/includes? content "error occurred")))

(deftest render-funnel-text-row-labels-test
  (testing "Static-viz Funnel Chart with text keys in viz-settings renders without error (#26944)."
    (mt/dataset test-data
      (let [funnel-query {:database (mt/id)
                          :type     :query
                          :query
                          {:source-table (mt/id :orders)
                           :aggregation  [[:count]]
                           :breakout     [[:field (mt/id :orders :created_at)
                                           {:base-type :type/DateTime :temporal-unit :month-of-year}]]}}
            funnel-card  {:display       :funnel
                          :dataset_query funnel-query
                          :visualization_settings
                          {:funnel.rows
                           [{:key "December", :name "December", :enabled true}
                            {:key "November", :name "November", :enabled true}
                            {:key "October", :name "October", :enabled true}
                            {:key "September", :name "September", :enabled true}
                            {:key "August", :name "August", :enabled true}
                            {:key "July", :name "July", :enabled true}
                            {:key "June", :name "June", :enabled true}
                            {:key "May", :name "May", :enabled true}
                            {:key "April", :name "April", :enabled true}
                            {:key "March", :name "March", :enabled true}
                            {:key "February", :name "February", :enabled true}
                            {:key "January", :name "January", :enabled true}],
                           :funnel.order_dimension "CREATED_AT"}}]
        (mt/with-temp [Card {card-id :id} funnel-card]
          (let [doc        (render.tu/render-card-as-hickory card-id)
                pulse-body (hik.s/select
                            (hik.s/class "pulse-body")
                            doc)]
            (is (not (render-error? pulse-body)))))))))

(def ^:private funnel-rows
  [["cart" 1500]
   ["checkout" 450]
   ["homepage" 10000]
   ["product_page" 5000]
   ["purchase" 225]])

(tx/defdataset funnel-data
  [["stages"
    [{:field-name "stage", :base-type :type/Text}
     {:field-name "count", :base-type :type/Quantity}]
    funnel-rows]])

(deftest render-funnel-with-row-keys-test
  (testing "Static-viz Funnel Chart with text keys in viz-settings and text in returned
            rows renders without error and in the order specified by the viz-settings (#39743)."
    (mt/dataset funnel-data
      (let [funnel-query {:database (mt/id)
                          :type     :query
                          :query
                          {:source-table (mt/id :stages)
                           ;; we explicitly select the 2 columns because if we don't the query returns the ID as well.
                           ;; this is done here to construct the failing case resulting from the reproduction steps in issue #39743
                           :fields       [[:field (mt/id :stages :stage)]
                                          [:field (mt/id :stages :count)]]}}
            funnel-card  {:display       :funnel
                          :dataset_query funnel-query
                          :visualization_settings
                          {:funnel.rows
                           [{:key "homepage" :name "homepage" :enabled true}
                            {:key "product_page" :name "product_page" :enabled true}
                            {:key "cart" :name "cart" :enabled true}
                            {:key "checkout" :name "checkout" :enabled true}
                            {:key "purchase" :name "purchase" :enabled true}]}}]
        (mt/with-temp [:model/Card {card-id :id} funnel-card]
          (let [row-names      (into #{} (map first funnel-rows))
                doc            (render.tu/render-card-as-hickory card-id)
                section-labels (->> doc
                                    (hik.s/select (hik.s/tag :tspan))
                                    (mapv (comp first :content))
                                    (filter row-names))]
            (is (= (map :key (get-in funnel-card [:visualization_settings :funnel.rows]))
                   section-labels))))))))

(deftest render-categorical-donut-test
  (let [columns [{:name          "category",
                  :display_name  "Category",
                  :base_type     :type/Text
                  :semantic_type nil}
                 {:name          "NumPurchased",
                  :display_name  "NumPurchased",
                  :base_type     :type/Integer
                  :semantic_type nil}]
        render  (fn [rows & [viz-settings]]
                  (body/render :categorical/donut :inline pacific-tz
                               render.tu/test-card
                               nil
                               {:cols columns :rows rows :viz-settings viz-settings}))
        prune   (fn prune [html-tree]
                  (walk/prewalk (fn no-maps [x]
                                  (if (vector? x)
                                    (filterv (complement map?) x)
                                    x))
                                html-tree))]
    (testing "Renders without error"
      (let [rendered-info (render [[nil 10] ["Doohickey" 65] ["Widget" 25]] {:show_values true})]
        (is (has-inline-image? rendered-info))))
    (testing "Includes percentages"
      (is (= [:div
              [:img]
              [:table
               [:tr [:td [:span "•"]] [:td "(empty)"] [:td "10%"]]
               [:tr [:td [:span "•"]] [:td "Doohickey"] [:td "65%"]]
               [:tr [:td [:span "•"]] [:td "Widget"] [:td "25%"]]]]
             (prune (:content (render [[nil 10] ["Doohickey" 65] ["Widget" 25]]))))))))

(deftest render-progress
  (let [col [{:name          "NumPurchased",
              :display_name  "NumPurchased",
              :base_type     :type/Integer
              :semantic_type nil}]
        render  (fn [rows]
                  (body/render :progress :inline pacific-tz
                               render.tu/test-card
                               nil
                               {:cols col :rows rows}))]
    (testing "Renders without error"
      (let [rendered-info (render [[25]])]
        (is (has-inline-image? rendered-info))))
    (testing "Renders negative value without error"
      (let [rendered-info (render [[-25]])]
        (is (has-inline-image? rendered-info))))))

(def donut-info #'body/donut-info)

(deftest ^:parallel donut-info-test
  (let [rows [["a" 45] ["b" 45] ["c" 5] ["d" 5]]]
    (testing "If everything is above the threshold does nothing"
      (is (= rows (:rows (donut-info 4 rows)))))
    (testing "Collapses smaller sections below threshold"
      (is (= [["a" 45] ["b" 45] ["Other" 10]]
             (:rows (donut-info 5 rows)))))
    (testing "Computes percentages"
      (is (= {"a" "45%" "b" "45%" "Other" "10%"}
             (:percentages (donut-info 5 rows)))))
    (testing "Includes zero percent rows"
      (let [rows [["a" 50] ["b" 50] ["d" 0]]]
        (is (= {"a" "50%" "b" "50%" "Other" "0%"}
               (:percentages (donut-info 5 rows))))))))

(deftest ^:parallel format-percentage-test
  (are [value expected] (= expected
                           (body/format-percentage 12345.4321 value))
    ".," "1,234,543.21%"
    "^&" "1&234&543^21%"
    " "  "1,234,543 21%"
    nil  "1,234,543.21%"
    ""   "1,234,543.21%"))

(defn- get-axis-classes
  [viz-tree]
  (let [nodes (render.tu/nodes-with-tag viz-tree :g)
        xf    (comp
               (mapcat #(filter map? %))
               (map :class)
               (mapcat #(str/split % #" "))
               (filter #{"visx-axis-left" "visx-axis-right"}))]
   (into #{} xf nodes)))

(deftest reasonable-split-axes-test
  (let [rows [["Category" "Series A" "Series B"]
              ["A"        1          1.3]
              ["B"        2          1.9]
              ["C"        3          4]]]
    (testing "Single X-axis, multiple series with close values does not split y-axis."
      (is (= #{"visx-axis-left"}
             (-> rows
                 (render.tu/make-viz-data :bar :single {})
                 :viz-tree
                 get-axis-classes))))
    (testing "Single X-axis, multiple series with far values does split y-axis."
      (is (= #{"visx-axis-left" "visx-axis-right"}
             (-> (conj rows ["D" 3 70])
                 (render.tu/make-viz-data :bar :single {})
                 :viz-tree
                 get-axis-classes))))
    (testing "Multiple series split does not fail when a series has the same value for all of its rows #27427"
      (let [rows [["Category" "Series A" "Series B"]
                  ["A"        1          1.3]
                  ["B"        1          1.9]
                  ["C"        1          4]]]
        (is (= #{"visx-axis-left"}
               (-> rows
                   (render.tu/make-viz-data :bar :single {})
                   :viz-tree
                   get-axis-classes)))))))

(deftest multi-x-axis-series-reasonable-split-axes-test
  (let [rows        [["Category" "Series A" "Series B"]
                     ["A"        1.0          1.3]
                     ["B"        2.0          1.9]
                     ["C"        3.0          3.2]]]
    (testing "Mulit-x-axis series with close values does not split y-axis."
      (is (= #{"visx-axis-left"}
             (-> rows
                 (render.tu/make-viz-data :bar :multi {})
                 :viz-tree
                 get-axis-classes))))
    (testing "Mulit-x-axis series with far values does split y-axis."
      (is (= #{"visx-axis-left" "visx-axis-right"}
             (-> (conj rows ["D" 3 70])
                 (render.tu/make-viz-data :bar :multi {})
                 :viz-tree
                 get-axis-classes))))))

(deftest ^:parallel x-and-y-axis-label-info-test
  (let [x-col {:display_name "X col"}
        y-col {:display_name "Y col"}]
    (testing "no custom viz settings"
      (is (= {:bottom "X col", :left "Y col"}
             (#'body/x-and-y-axis-label-info x-col y-col nil))))
    (testing "w/ custom viz settings"
      (is (= {:bottom "X custom", :left "Y custom"}
             (#'body/x-and-y-axis-label-info x-col y-col {:graph.x_axis.title_text "X custom"
                                                          :graph.y_axis.title_text "Y custom"}))))))

(deftest lab-charts-respect-y-axis-range
  (let [rows     [["Category" "Series A" "Series B"]
                  ["A"        1          1.3]
                  ["B"        2          1.9]
                  ["C"        -3          6]]
        renderfn (fn [viz]
                   (-> rows
                       (render.tu/make-card-and-data :bar)
                       (render.tu/merge-viz-settings viz)
                       render.tu/render-as-hiccup))]
    (testing "Graph min and max values are respected in the render. #27927"
      (let [to-find           ["14" "2" "-2" "-14"]
            no-viz-render     (renderfn {})
            viz-a-render      (renderfn {:graph.y_axis.max 14
                                         :graph.y_axis.min -14})
            nodes-without-viz (mapv #(last (last (render.tu/nodes-with-exact-text no-viz-render %))) to-find)
            nodes-with-viz    (mapv #(last (last (render.tu/nodes-with-exact-text viz-a-render %))) to-find)]
        ;; we only see 14/-14 in the render where min and max are explicitly set.
        ;; this is because the data's min and max values are only -3 and 6, and the viz will minimize the axis range
        ;; without cutting off the chart's actual values
        (is (= {:without-viz ["2" "-2"]
                :with-viz    ["14" "2" "-2" "-14"]}
               {:without-viz (remove nil? nodes-without-viz)
                :with-viz    nodes-with-viz}))))
    (testing "Graph min and max values do not cut off the chart."
      (let [viz-b-render   (renderfn {:graph.y_axis.max 1
                                      :graph.y_axis.min -1})
            to-find        ["14" "2" "-2" "-14"]
            nodes-with-viz (mapv #(last (last (render.tu/nodes-with-exact-text viz-b-render %))) to-find)]
        (is (= ["2" "-2"] (remove nil? nodes-with-viz)))))))

(deftest invalid-graph-dim-render-test
  (testing "A card with an invalid graph.dimension (or metric) will still render (#37266)"
    (mt/dataset test-data
      (mt/with-temp [Card {card-id :id}
                     {:dataset_query          {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table (mt/id :orders)
                                                          :aggregation  [[:count]]
                                                          :filter       [:between [:field (mt/id :orders :created_at) nil] "2019-05-16" "2019-08-16"]
                                                          :breakout     [:field (mt/id :orders :created_at) {:temporal-unit :week}]}}
                      :display                :line
                      ;; While not part of the original issue, this fix also handles bad metrics.
                      :visualization_settings {:graph.metrics    ["frooby"]
                                               ;; This dimension does not exist and used to break the render
                                               ;; This test verifies that it now works.
                                               :graph.dimensions ["_sdc_extracted_at"]}}]
        (let [{:keys [dataset_query result_metadata dataset] :as card} (t2/select-one :model/Card :id card-id)
              query-results (qp/process-query
                              (cond-> dataset_query
                                dataset
                                (assoc-in [:info :metadata/dataset-metadata] result_metadata)))
              {:keys [content]} (body/render :line :inline "UTC" card nil (:data query-results))]
          (testing "Content is generated (rather than an exception being thrown)"
            (is (= :div (first content)))))))))

(deftest unknown-column-settings-test
  (testing "Unknown `:column_settings` keys don't break static-viz rendering with a Null Pointer Exception (#27941)."
    (mt/dataset test-data
      (let [q   {:database (mt/id)
                 :type     :query
                 :query
                 {:source-table (mt/id :reviews)
                  :aggregation  [[:sum [:field (mt/id :reviews :rating) {:base-type :type/Integer}]]],
                  :breakout     [[:field (mt/id :reviews :created_at) {:base-type :type/DateTime, :temporal-unit :week}]
                                 [:field (mt/id :reviews :reviewer) {:base-type :type/Text}]],
                  :filter       [:between [:field (mt/id :reviews :product_id) {:base-type :type/Integer}] 0 10]}}
            viz {:pivot_table.column_split
                 {:rows    [[:field (mt/id :reviews :reviewer) {:base-type :type/Text}]],
                  :columns [[:field (mt/id :reviews :created_at) {:base-type :type/DateTime, :temporal-unit :week}]],
                  :values  [[:aggregation 0]]}
                 :column_settings
                 {(format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/DateTime\"}]]" (mt/id :reviews :created_at))
                  {:pivot_table.column_sort_order "ascending"}}}]
        (mt/dataset test-data
          (mt/with-temp [Card                 {card-id :id} {:display                :pivot
                                                             :dataset_query          q
                                                             :visualization_settings viz}]
            (testing "the render succeeds with unknown column settings keys"
              (is (seq (render.tu/render-card-as-hickory card-id))))))))))

(deftest trend-chart-renders-in-alerts-test
  (testing "Trend charts render successfully in Alerts. (#39854)"
    (mt/dataset test-data
      (let [q {:database (mt/id)
               :type     :query
               :query
               {:source-table (mt/id :orders)
                :aggregation  [[:count]]
                :breakout     [[:field (mt/id :orders :created_at) {:base-type :type/DateTime, :temporal-unit :month}]]}}]
        ;; Alerts are set on Questions. They run through the 'pulse' code the same as subscriptions,
        ;; But will not have any Dashcard data associated, which caused an error in the static-viz render code
        ;; which implicitly expected a DashCard to exist
        ;; Here, we simulate an Alert (NOT a subscription) by only providing a card and not mocking a DashCard.
        (mt/with-temp [:model/Card {card-id :id} {:display       :smartscalar
                                                  :dataset_query q}]
          (let [doc       (render.tu/render-card-as-hickory card-id)
                span-text (->> doc
                               (hik.s/select (hik.s/tag :span))
                               (mapv (comp first :content))
                               (filter string?)
                               (filter #(str/includes? % "previous month")))]
            ;; we look for content that we are certain comes from a
            ;; successfully rendered trend chart.
            (is (= ["vs. previous month: "] span-text))))))))

(deftest axis-selection-for-series-test
  (testing "When the user specifies all series to be on left or right, it will render. (#38839)"
    (mt/dataset test-data
      (let [q   {:database (mt/id)
                 :type     :query
                 :query
                 {:source-table (mt/id :products)
                  :aggregation  [[:count]]
                  :breakout
                  [[:field (mt/id :products :category) {:base-type :type/Text}]
                   [:field (mt/id :products :price) {:base-type :type/Float, :binning {:strategy :default}}]]}}
            viz (fn [dir]
                  {:series_settings
                   {:Doohickey {:axis dir}
                    :Gadget    {:axis dir}
                    :Gizmo     {:axis dir}
                    :Widget    {:axis dir}},
                   :graph.dimensions ["PRICE" "CATEGORY"],
                   :graph.metrics    ["count"]}) ]
        (mt/with-temp [:model/Card {left-card-id :id} {:display                :bar
                                                       :visualization_settings (viz "left")
                                                       :dataset_query          q}
                       :model/Card {right-card-id :id} {:display                :bar
                                                        :visualization_settings (viz "right")
                                                        :dataset_query          q}]
          (testing "Every series on the left correctly only renders left axis."
            (let [doc        (render.tu/render-card-as-hickory left-card-id)
                  left-axis  (hik.s/select (hik.s/class "visx-axis-left") doc)
                  right-axis (hik.s/select (hik.s/class "visx-axis-right") doc)]
              (is (= {:left  1
                      :right 0}
                     {:left  (count left-axis)
                      :right (count right-axis)}))))
          (testing "Every series on the left correctly only renders right axis."
            (let [doc        (render.tu/render-card-as-hickory right-card-id)
                  left-axis  (hik.s/select (hik.s/class "visx-axis-left") doc)
                  right-axis (hik.s/select (hik.s/class "visx-axis-right") doc)]
              (is (= {:left  0
                      :right 1}
                     {:left  (count left-axis)
                      :right (count right-axis)})))))))))
