(ns metabase.util-test
  "Tests for functions in `metabase.util`."
  (:require [clojure.test :refer :all]
            [clojure.test.check.clojure-test :refer [defspec]]
            [clojure.test.check.generators :as gen]
            [clojure.test.check.properties :as prop]
            [flatland.ordered.map :refer [ordered-map]]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest decolorize-test
  (is (= "[31mmessage[0m"
         (u/colorize 'red "message")))
  (is (= "message"
         (u/decolorize "[31mmessage[0m")))
  (is (= "message"
         (u/decolorize (u/colorize 'red "message"))))
  (is (= nil
         (u/decolorize nil))))

(deftest host-up?-test
  (testing "host-up?"
    (mt/are+ [s expected] (= expected
                             (u/host-up? s))
      "localhost"  true
      "nosuchhost" false))
  (testing "host-port-up?"
    (is (= false
           (u/host-port-up? "nosuchhost" 8005)))))

(deftest url?-test
  (mt/are+ [s expected] (= expected
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

(deftest state?-test
  (mt/are+ [s expected] (= expected
                        (u/state? s))
    "louisiana"      true
    "north carolina" true
    "WASHINGTON"     true
    "CA"             true
    "NY"             true
    "random"         false
    nil              false
    3                false
    (Object.)        false))

(deftest qualified-name-test
  (mt/are+ [k expected] (= expected
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
  (mt/are+ [m keyseq expected] (= expected
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
  (mt/are+ [s expected]    (= expected
                        (u/base64-string? s))
    "ABc="         true
    "ABc/+asdasd=" true
    100            false
    "<<>>"         false
    "{\"a\": 10}"  false
    ;; must be at least 2 characters...
    "/"            false
    ;; and end with padding if needed
    "QQ"           false
    "QQ="          false
    "QQ=="         true
    ;; padding has to go at the end
    "==QQ"         false))

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
  (mt/are+ [n expected] (= expected
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
  (mt/are+ [input expected] (= expected
                            (u/one-or-many input))
    nil   nil
    [nil] [nil]
    42    [42]
    [42]  [42]))

(deftest topological-sort-test
  (mt/are+ [input expected] (= expected
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
  (mt/are+ [s expected] (= expected
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

(deftest or-with-test
  (testing "empty case"
    (is (= (or) (u/or-with identity))))
  (testing "short-circuiting"
    (let [counter (atom [])
          expensive-fn (fn [x] (swap! counter conj x) x)
          result (u/or-with even?
                            (expensive-fn 1)
                            (expensive-fn 2)
                            (expensive-fn 3))]
      (is (= [result @counter]
             [2 [1 2]]))))
  (testing "failure"
    (is (nil? (u/or-with even? 1 3 5)))))

(deftest ip-address?-test
  (mt/are+ [x expected] (= expected
                           (u/ip-address? x))
    "8.8.8.8"              true
    "185.233.100.23"       true
    "500.1.1.1"            false
    "192.168.1.a"          false
    "0:0:0:0:0:0:0:1"      true
    "52.206.149.9"         true
    "2001:4860:4860::8844" true
    "wow"                  false
    "   "                  false
    ""                     false
    nil                    false
    100                    false))

;; this would be such a good spot for test.check
(deftest sorted-take-test
  (testing "It ensures there are never more than `size` items in the priority queue"
    (let [limit 5
          rf    (u/sorted-take limit compare)]
      (reduce (fn [q x]
                (let [q' (rf q x)]
                  ;; a bit internal but this is really what we're after: bounded size while we look for the biggest
                  ;; elements
                  (is (<= (.size q) limit))
                  q))
              (rf)
              (shuffle (range 30))))))

(defspec sorted-take-test-size
  (prop/for-all [coll (gen/list (gen/tuple gen/int gen/string))
                 size (gen/fmap inc gen/nat)]
    (= (vec (take-last size (sort coll)))
       (transduce (map identity)
                  (u/sorted-take size compare)
                  coll))))

(defspec sorted-take-test-comparator
  (prop/for-all [coll (gen/list (gen/fmap (fn [x] {:score x}) gen/int))
                 size (gen/fmap inc gen/nat)]
    (let [coll    (shuffle coll)
          kompare (fn [{score-1 :score} {score-2 :score}]
                    (compare score-1 score-2))]
      (= (vec (take-last size (sort-by identity kompare coll)))
         (transduce (map identity)
                    (u/sorted-take size kompare)
                    coll)))))
