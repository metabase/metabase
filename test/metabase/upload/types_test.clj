(ns ^:mb/once metabase.upload.types-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.upload.types :as upload-types]
   [metabase.util.ordered-hierarchy :as ordered-hierarchy]))

(def ^:private bool-type         ::upload-types/boolean)
(def ^:private int-type          ::upload-types/int)
(def ^:private bool-int-type     ::upload-types/*boolean-int*)
(def ^:private float-type        ::upload-types/float)
(def ^:private float-or-int-type ::upload-types/*float-or-int*)
(def ^:private vchar-type        ::upload-types/varchar-255)
(def ^:private date-type         ::upload-types/date)
(def ^:private datetime-type     ::upload-types/datetime)
(def ^:private offset-dt-type    ::upload-types/offset-datetime)
(def ^:private text-type         ::upload-types/text)

(deftest ^:parallel type-detection-and-parse-test
  (doseq [[string-value expected-value expected-type separators]
          ;; Number-related
          [["0.0"        0              float-or-int-type "."]
           ["0.0"        0              float-or-int-type ".,"]
           ["0,0"        0              float-or-int-type ",."]
           ["0,0"        0              float-or-int-type ", "]
           ["0.0"        0              float-or-int-type ".’"]
           ["-0.0"       -0.0           float-or-int-type "."]
           ["-0.0"       -0.0           float-or-int-type ".,"]
           ["-0,0"       -0.0           float-or-int-type ",."]
           ["-0,0"       -0.0           float-or-int-type ", "]
           ["-0.0"       -0.0           float-or-int-type ".’"]
           ["(0.0)"      -0.0           float-or-int-type "."]
           ["(0.0)"      -0.0           float-or-int-type ".,"]
           ["(0,0)"      -0.0           float-or-int-type ",."]
           ["(0,0)"      -0.0           float-or-int-type ", "]
           ["(0.0)"      -0.0           float-or-int-type ".’"]
           ["-4300.00€"  -4300          float-or-int-type ".,"]
           ["£1,000.00"  1000           float-or-int-type]
           ["£1,000.00"  1000           float-or-int-type "."]
           ["£1,000.00"  1000           float-or-int-type ".,"]
           ["£1.000,00"  1000           float-or-int-type ",."]
           ["£1 000,00"  1000           float-or-int-type ", "]
           ["£1’000.00"  1000           float-or-int-type ".’"]
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
           ["0"          false          bool-int-type]
           ["1"          true           bool-int-type]
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
           ["$2.0"       2              float-or-int-type ".,"]
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
    (let [settings    {:number-separators (or separators ".,")}
          type->check (#'upload-types/settings->type->check settings)
          value-type  (#'upload-types/value->type type->check string-value)
          ;; get the type of the column, if we created it based on only that value
          col-type    (first (upload-types/column-types-from-rows settings nil [[string-value]]))
          parser      (upload-parsing/upload-type->parser col-type settings)]
      (testing (format "\"%s\" is a %s" string-value value-type)
        (is (= expected-type
               value-type)))
      (testing (format "\"%s\" is parsed into %s" string-value expected-value)
        (is (= expected-value
               (parser string-value)))))))

(deftest ^:parallel type-coalescing-test
  (doseq [[type-a            type-b           expected]
          [[bool-type        bool-type        bool-type]
           [bool-type        int-type         vchar-type]
           [bool-type        bool-int-type    bool-type]
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
           [int-type         bool-int-type    int-type]
           [bool-int-type    bool-int-type    bool-int-type]
           [float-type       vchar-type       vchar-type]
           [float-type       text-type        text-type]
           [float-type       date-type        vchar-type]
           [float-type       datetime-type    vchar-type]
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
    (is (= expected (ordered-hierarchy/first-common-ancestor upload-types/h type-a type-b))
        (format "%s + %s = %s" (name type-a) (name type-b) (name expected)))))

(deftest ^:parallel coercion-soundness-test
  (testing "Every coercion maps to a stricter type that is a direct descendant"
    (is (empty?
         ;; Build a set of all type-pairs that violate this constraint
         (into (sorted-set)
               (comp (mapcat (fn [[column-type value-types]]
                               (for [value-type value-types]
                                 [column-type value-type])))
                     (remove (fn [[column-type value-type]]
                               ;; Strictly speaking we only require that there is a route which only traverses
                               ;; through abstract nodes, but it's much simpler to enforce this stronger condition:
                               ;; that `column-type` is a child of `value-type`
                               (contains? (ordered-hierarchy/children upload-types/h value-type) column-type))))
               @#'upload-types/column-type->coercible-value-types)))))

(deftest ^:parallel initial-column-type-test
  (let [column-type (partial upload-types/concretize nil)]
    (testing "Unknown value types are treated as text"
      (is (= ::upload-types/text (column-type nil))))
    (testing "Non-abstract value types resolve to themselves"
      (let [ts upload-types/column-types]
        (is (= (zipmap ts ts)
               (zipmap (map column-type ts) ts)))))
    (testing "Abstract values are resolved using an explicit map, which is consistent with the hierarchy"
      (doseq [[value-type expected-column-type] @#'upload-types/abstract->concrete]
        (is (= expected-column-type (column-type value-type)))
        ;; Strictly speaking we only require that there is a route from each abstract node to its column type which only
        ;; traverses through abstract nodes, but it's much simpler to enforce this stronger condition.
        (is (contains? (parents upload-types/h value-type) expected-column-type))))))

(deftest ^:parallel append-column-type-test
  (doseq [existing-type upload-types/value-types
          value-type    upload-types/value-types]
    (case [existing-type value-type]
      [::upload-types/int ::upload-types/*float-or-int*]
      (testing "We coerce floats with fractional part to plan integers when appending into an existing integer column"
        (is (= ::upload-types/int (upload-types/concretize existing-type value-type))))

      ;; This is unsatisfying, would be good if this interface also covered promoting columns and rejecting values.
      (testing (format "We append %s values to %s columns as if we were inserting them into new columns" existing-type value-type)
        (is (= (upload-types/concretize nil value-type)
               (upload-types/concretize existing-type value-type)))))))

(defn- re-namespace
  "Replace the namespace in any namespaced keyword with this test namespace, return all other values unchanged."
  [x]
  (if (and (keyword? x) (namespace x))
    (keyword (name (ns-name *ns*)) (name x))
    x))

;; Translate the hierarchy to talk about this namespace, so that we can omit an explicit namespace for brevity.
(def ^:private h (walk/postwalk re-namespace upload-types/h))

(deftest ^:parallel parents-test
  (testing "Parents are listed according to the order that this tag was derived from each of them"
    (is (nil? (parents h ::text)))
    (is (= [::text] (vec (parents h ::varchar-255))))
    (is (= [::*float-or-int*] (vec (parents h ::int))))
    (is (= [::boolean ::int] (vec (parents h ::*boolean-int*))))))

(deftest ^:parallel children-test
  (testing "Children are listed in reverse order to when they were each derived from this tag"
    (is (nil? (ordered-hierarchy/children h ::*boolean-int*)))
    (is (= [::varchar-255] (vec (ordered-hierarchy/children h ::text))))
    (is (= [::*float-or-int*] (vec (ordered-hierarchy/children h ::float))))
    (is (= [::auto-incrementing-int-pk ::*boolean-int*] (vec (ordered-hierarchy/children h ::int))))))

(deftest ^:parallel ancestors-test
  (testing "Linear ancestors are listed in order"
    (is (nil? (ancestors h ::text)))
    (is (= [::text] (vec (ancestors h ::varchar-255))))
    (is (= [::varchar-255 ::text] (vec (ancestors h ::boolean))))
    (is (= [::*float-or-int* ::float ::varchar-255 ::text] (vec (ancestors h ::int)))))

  (testing "Non-linear ancestors are listed in topological order, following edges in the order they were defined."
    (is (= [::boolean
            ::int
            ::*float-or-int*
            ::float
            ::varchar-255
            ::text]
           (vec (ancestors h ::*boolean-int*))))))

(deftest ^:parallel descendants-test
  (testing "Linear descendants are listed in order"
    (is (nil? (descendants h ::*boolean-int*)))
    (is (nil? (descendants h ::date)))
    (is (= [::date] (vec (descendants h ::datetime))))
    (is (= [::*boolean-int*] (vec (descendants h ::boolean)))))

  (testing "Non-linear descendants are listed in reverse topological order, following edges in reserve order."
    (is (= [::*float-or-int*
            ::int
            ::auto-incrementing-int-pk
            ::*boolean-int*]
           (vec (descendants h ::float))))
    (is (= [::varchar-255
            ::offset-datetime
            ::datetime
            ::date
            ::float
            ::*float-or-int*
            ::int
            ::auto-incrementing-int-pk
            ::boolean
            ::*boolean-int*]
           (vec (descendants h ::text))))))

(deftest ^:parallel sorted-tags-test
  (testing "Tags are returned in a topological ordering that also preserves insertion order of the edges."
    (is (= [::*boolean-int*
            ::boolean
            ::auto-incrementing-int-pk
            ::int
            ::*float-or-int*
            ::float
            ::date
            ::datetime
            ::offset-datetime
            ::varchar-255
            ::text]
           (vec (ordered-hierarchy/sorted-tags h))))))

(deftest ^:parallel first-common-ancestor-test
  (testing "The first-common-ancestor is the first tag in the lineage of tag-a that is also in the lineage of tag-b"
    (is (= ::*boolean-int* (ordered-hierarchy/first-common-ancestor h ::*boolean-int* nil)))
    (is (= ::*boolean-int* (ordered-hierarchy/first-common-ancestor h ::*boolean-int* ::*boolean-int*)))
    (is (= ::boolean (ordered-hierarchy/first-common-ancestor h ::*boolean-int* ::boolean)))
    (is (= ::varchar-255 (ordered-hierarchy/first-common-ancestor h ::boolean ::int)))))
