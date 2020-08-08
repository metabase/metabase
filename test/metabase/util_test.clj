(ns metabase.util-test
  "Tests for functions in `metabase.util`."
  (:require [clojure.test :refer :all]
            [clojure.tools.macro :as tools.macro]
            [flatland.ordered.map :refer [ordered-map]]
            [metabase
             [test :as mt]
             [util :as u]]))

(defn- are+-message [expr arglist args]
  (pr-str
   (second
    (macroexpand-1
     (list
      `tools.macro/symbol-macrolet
      (vec (apply concat (map-indexed (fn [i arg]
                                        [arg (nth args i)])
                                      arglist)))
      expr)))))

(defmacro ^:private are+
  "Like `clojure.test/are` but includes a message for easier test failure debugging. (Also this is somewhat more
  efficient since it generates far less code ­ it uses `doseq` rather than repeating the entire test each time.)

  TODO ­ if this macro proves useful, we should consider moving it to somewhere more general, such as
  `metabase.test`."
  {:style/indent 2}
  [argv expr & args]
  `(doseq [args# ~(mapv vec (partition (count argv) args))
           :let [~argv args#]]
     (is ~expr
         (are+-message '~expr '~argv args#))))

(deftest host-up?-test
  (testing "host-up?"
    (are+ [s expected] (= expected
                          (u/host-up? s))
      "localhost"  true
      "nosuchhost" false))
  (testing "host-port-up?"
    (is (= false
           (u/host-port-up? "nosuchhost" 8005)))))

(deftest url?-test
  (are+ [s expected] (= expected
                        (u/url? s))
    "http://google.com"                                                                      true
    "https://google.com"                                                                     true
    "https://amazon.co.uk"                                                                   true
    "http://google.com?q=my-query&etc"                                                       true
    "http://www.cool.com"                                                                    true
    "http://localhost/"                                                                      true
    "http://localhost:3000"                                                                  true
    "https://www.mapbox.com/help/data/stations.geojson"                                      true
    "http://www.cool.com:3000"                                                               true
    "http://localhost:3000/auth/reset_password/144_f98987de-53ca-4335-81da-31bb0de8ea2b#new" true
    "http://192.168.1.10/"                                                                   true
    "http://metabase.intranet/"                                                              true
    ;; missing protocol
    "google.com"                                                                             false
    ;; protocol isn't HTTP/HTTPS
    "ftp://metabase.com"                                                                     false
    ;; no domain
    "http://.com"                                                                            false
    ;; no TLD
    "http://google."                                                                         false
    ;; no domain or tld
    "http://"                                                                                false
    ;; nil .getAuthority needs to be handled or NullPointerException
    "http:/"                                                                                 false))

(deftest qualified-name-test
  (are+ [k expected] (= expected
                        (u/qualified-name k))
    :keyword                          "keyword"
    :namespace/keyword                "namespace/keyword"
    ;; `qualified-name` should return strings as-is
    "some string"                     "some string"
    ;; `qualified-name` should work on anything that implements `clojure.lang.Named`
    (reify clojure.lang.Named
      (getName [_] "name")
      (getNamespace [_] "namespace")) "namespace/name"
    ;; `qualified-name` shouldn't throw an NPE (unlike `name`)
    nil                               nil)
  (testing "we shouldn't ignore non-nil values -- `u/qualified-name` should throw an Exception if `name` would"
    (is (thrown? ClassCastException
                 (u/qualified-name false)))))

(deftest rpartial-test
  (is (= 3
         ((u/rpartial - 5) 8)))
  (is (= -7
         ((u/rpartial - 5 10) 8))))

(deftest key-by-test
  (is (= {1 {:id 1, :name "Rasta"}
          2 {:id 2, :name "Lucky"}}
         (u/key-by :id [{:id 1, :name "Rasta"}
                        {:id 2, :name "Lucky"}]))))

(deftest remove-diacritical-marks-test
  (doseq [[s expected] {"üuuü" "uuuu"
                        "åéîü" "aeiu"
                        "åçñx" "acnx"
                        ""     nil
                        nil    nil}]
    (testing (list 'u/remove-diacritical-marks s)
      (is (= expected
             (u/remove-diacritical-marks s))))))

(deftest slugify-test
  (doseq [[group s->expected]
          {nil
           {"ToucanFest 2017"               "toucanfest_2017"
            "Cam's awesome toucan emporium" "cam_s_awesome_toucan_emporium"
            "Frequently-Used Cards"         "frequently_used_cards"}

           "check that diactrics get removed"
           {"Cam Saul's Toucannery"      "cam_saul_s_toucannery"
            "toucans dislike piñatas :(" "toucans_dislike_pinatas___" }

           "check that non-ASCII characters get URL-encoded (so we can support non-Latin alphabet languages; see #3818)"
           {"勇士" "%E5%8B%87%E5%A3%AB"}}]
    (testing group
      (doseq [[s expected] s->expected]
        (testing (list 'u/slugify s)
          (is (= expected
                 (u/slugify s))))))))

(deftest select-nested-keys-test
  (are+ [m keyseq expected] (= expected
                               (u/select-nested-keys m keyseq))
    {:a 100, :b {:c 200, :d 300}}              [:a [:b :d] :c]   {:a 100, :b {:d 300}}
    {:a 100, :b {:c 200, :d 300}}              [:b]              {:b {:c 200, :d 300}}
    {:a 100, :b {:c 200, :d 300}}              [[:b :c :d]]      {:b {:c 200, :d 300}}
    {:a 100, :b {:c 200, :d {:e 300}}}         [[:b [:d :e]]]    {:b {:d {:e 300}}}
    {:a 100, :b {:c 200, :d {:e 300}}}         [[:b :d]]         {:b {:d {:e 300}}}
    {:a {:b 100, :c 200}, :d {:e 300, :f 400}} [[:a :b] [:d :e]] {:a {:b 100}, :d {:e 300}}
    {:a 100, :b {:c 200, :d 300}}              [[:a]]            {:a 100}
    {:a 100, :b {:c 200, :d 300}}              [:c]              {}
    nil                                        [:c]              {}
    {}                                         nil               {}
    {:a 100, :b {:c 200, :d 300}}              []                {}
    {}                                         [:c]              {}))

(deftest base64-string?-test
  (are+ [s expected] (= expected
                        (u/base64-string? s))
    "ABc"           true
    "ABc/+asdasd==" true
    100             false
    "<<>>"          false
    "{\"a\": 10}"   false))

(deftest select-keys-test
  (testing "select-non-nil-keys"
    (is (= {:a 100}
           (u/select-non-nil-keys {:a 100, :b nil} #{:a :b :c}))))
  (testing "select-keys-when"
    (is (= {:a 100, :b nil, :d 200}
           (u/select-keys-when {:a 100, :b nil, :d 200, :e nil}
             :present #{:a :b :c}
             :non-nil #{:d :e :f})))))

(deftest order-of-magnitude-test
  (are+ [n expected] (= expected
                        (u/order-of-magnitude n))
    0.01  -2
    0.5   -1
    4     0
    12    1
    444   2
    1023  3
    0     0
    -1444 3))

(deftest index-of-test
  (are [input expected] (= expected
                           (u/index-of pos? input))
    [-1 0 2 3]   2
    [-1 0 -2 -3] nil
    nil          nil
    []           nil))

(deftest snake-key-test
  (is (= {:num_cans 2, :lisp_case? {:nested_maps? true}}
         (u/snake-keys {:num-cans 2, :lisp-case? {:nested-maps? true}}))))

(deftest one-or-many-test
  (are+ [input expected] (= expected
                            (u/one-or-many input))
    nil   nil
    [nil] [nil]
    42    [42]
    [42]  [42]))

(deftest topological-sort-test
  (are+ [input expected] (= expected
                            (u/topological-sort identity input))
    {:b []
     :c [:a]
     :e [:d]
     :d [:a :b :c]
     :a []}
    (ordered-map :a [] :b [] :c [:a] :d [:a :b :c] :e [:d])

    {}  nil
    nil nil))

(deftest lower-case-en-test
  (mt/with-locale "tr"
    (is (= "id"
           (u/lower-case-en "ID")))))

(deftest upper-case-en-test
  (mt/with-locale "tr"
    (is (= "ID"
           (u/upper-case-en "id")))))

(deftest parse-currency-test
  (are+ [s expected] (= expected
                        (u/parse-currency s))
    nil             nil
    ""              nil
    "   "           nil
    "$1,000"        1000.0M
    "$1,000,000"    1000000.0M
    "$1,000.00"     1000.0M
    "€1.000"        1000.0M
    "€1.000,00"     1000.0M
    "€1.000.000,00" 1000000.0M
    "-£127.54"      -127.54M
    "-127,54 €"     -127.54M
    "kr-127,54"     -127.54M
    "€ 127,54-"     -127.54M
    "¥200"          200.0M
    "¥200."         200.0M
    "$.05"          0.05M
    "0.05"          0.05M))

;; Local Variables:
;; eval: (add-to-list (make-local-variable 'clojure-align-cond-forms) "are+")
;; End:
