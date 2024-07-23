(ns ^:mb/once metabase.util-test
  "Tests for functions in `metabase.util`."
  (:require
   #?@(:clj [[metabase.test :as mt]
             [malli.generator :as mg]])
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [flatland.ordered.map :refer [ordered-map]]
   [metabase.util :as u])
  #?(:clj (:import [java.time DayOfWeek Month])))

#?(:clj (set! *warn-on-reflection* true))

(deftest ^:parallel add-period-test
  (is (= "This sentence needs a period."
         (u/add-period "This sentence needs a period")))
  (is (= "This sentence doesn't need a period!"
         (u/add-period "This sentence doesn't need a period!")))
  (is (= "What about this one?"
         (u/add-period "What about this one?")))
  (is (= "   "
         (u/add-period "   "))))

(deftest ^:parallel url?-test
  (are [s expected] (= expected
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
    "http://under_score.ca/"                                                                 true
    "http://under__score.ca/"                                                                true
    "http://_under_score.ca/"                                                                true
    "http://__under_score.ca/"                                                               true
    "http://hy-phen.ca/"                                                                     true
    "http://hy--phen.ca/"                                                                    true
    "http://two..dots.ca"                                                                    false
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

(deftest ^:parallel state?-test
  (are [x expected] (= expected
                       (u/state? x))
    "louisiana"            true
    "north carolina"       true
    "WASHINGTON"           true
    "CA"                   true
    "NY"                   true
    "random"               false
    nil                    false
    3                      false
    #?(:clj  (Object.)
       :cljs (js/Object.)) false))

(deftest ^:parallel qualified-name-test
  (are [k expected] (= expected
                       (u/qualified-name k))
    :keyword                          "keyword"
    :namespace/keyword                "namespace/keyword"
    ;; `qualified-name` should return strings as-is
    "some string"                     "some string"
    ;; `qualified-name` should work on anything that implements `clojure.lang.Named`
    #?(:clj  (reify clojure.lang.Named
               (getName [_] "name")
               (getNamespace [_] "namespace"))
       :cljs (reify INamed
               (-name [_] "name")
               (-namespace [_] "namespace")))  "namespace/name"
    ;; `qualified-name` shouldn't throw an NPE (unlike `name`)
    nil                               nil)
  (testing "we shouldn't ignore non-nil values -- `u/qualified-name` should throw an Exception if `name` would"
    (is (thrown? #?(:clj ClassCastException :cljs js/Error)
                 (u/qualified-name false)))))

(deftest ^:parallel remove-diacritical-marks-test
  (doseq [[s expected] {"üuuü" "uuuu"
                        "åéîü" "aeiu"
                        "åçñx" "acnx"
                        ""     nil
                        nil    nil}]
    (testing (list 'u/remove-diacritical-marks s)
      (is (= expected
             (u/remove-diacritical-marks s))))))

(deftest ^:parallel slugify-test
  (doseq [[group s->expected]
          {nil
           {"ToucanFest 2017"               "toucanfest_2017"
            "Cam's awesome toucan emporium" "cam_s_awesome_toucan_emporium"
            "Frequently-Used Cards"         "frequently_used_cards"}

           "check that diactrics get removed"
           {"Cam Saul's Toucannery"      "cam_saul_s_toucannery"
            "toucans dislike piñatas :(" "toucans_dislike_pinatas___"}

           "check that non-ASCII characters get URL-encoded (so we can support non-Latin alphabet languages; see #3818)"
           {"勇士" "%E5%8B%87%E5%A3%AB"}}]
    (testing group
      (doseq [[s expected] s->expected]
        (testing (list 'u/slugify s)
          (is (= expected
                 (u/slugify s))))))))

(deftest ^:parallel slugify-unicode-test
  (doseq [[group s->expected]
          {nil
           {"ToucanFest 2017"               "toucanfest_2017"
            "Cam's awesome toucan emporium" "cam_s_awesome_toucan_emporium"
            "Frequently-Used Cards"         "frequently_used_cards"}

           "check that diactrics get removed"
           {"Cam Saul's Toucannery"      "cam_saul_s_toucannery"
            "toucans dislike piñatas :(" "toucans_dislike_pinatas___"}

           "check that non-ASCII characters are preserved"
           {"勇士" "勇士"}}]
    (testing group
      (doseq [[s expected] s->expected]
        (testing (list 'u/slugify s {:unicode? true})
          (is (= expected
                 (u/slugify s {:unicode? true}))))))))

(deftest ^:parallel select-nested-keys-test
  (are [m keyseq expected] (= expected
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

(deftest ^:parallel base64-string?-test
  (are [s expected]    (= expected
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
    ;; line breaks and spaces should be OK
    "Q\rQ\n=\r\n=" true
    " Q Q = = "    true
    ;; padding has to go at the end
    "==QQ"         false))

(deftest ^:parallel select-keys-test
  (testing "select-non-nil-keys"
    (is (= {:a 100}
           (u/select-non-nil-keys {:a 100, :b nil} #{:a :b :c}))))
  (testing "select-keys-when"
    (is (= {:a 100, :b nil, :d 200}
           (u/select-keys-when {:a 100, :b nil, :d 200, :e nil}
             :present #{:a :b :c}
             :non-nil #{:d :e :f})))))

(deftest ^:parallel order-of-magnitude-test
  (are [n expected] (= expected
                       (u/order-of-magnitude n))
    0.01  -2
    0.5   -1
    4     0
    12    1
    444   2
    1023  3
    0     0
    -1444 3))

(deftest ^:parallel index-of-test
  (are [input expected] (= expected
                           (u/index-of pos? input))
    [-1 0 2 3]   2
    [-1 0 -2 -3] nil
    nil          nil
    []           nil))

(deftest ^:parallel index-of-lazy-test
  (testing "index-of should be lazy"
    (let [evaluated? (atom false)]
      (is (= 3
             (u/index-of string? (lazy-cat [1 2 3 "STRING"]
                                           (reset! evaluated? true)
                                           [4]))))
      (is (false? @evaluated?)))))

(deftest ^:parallel snake-key-test
  (is (= {:num_cans 2, :lisp_case? {:nested_maps? true}}
         (u/snake-keys {:num-cans 2, :lisp-case? {:nested-maps? true}}))))

(deftest ^:parallel one-or-many-test
  (are [input expected] (= expected
                           (u/one-or-many input))
    nil   nil
    [nil] [nil]
    42    [42]
    [42]  [42]))

(deftest ^:parallel topological-sort-test
  (are [input expected] (= expected
                           (u/topological-sort identity input))
    {:b []
     :c [:a]
     :e [:d]
     :d [:a :b :c]
     :a []}
    (ordered-map :a [] :b [] :c [:a] :d [:a :b :c] :e [:d])

    {}  nil
    nil nil))

(deftest ^:parallel lower-case-en-test
  (is (= "id"
         (u/lower-case-en "ID"))))

#?(:clj
   (deftest lower-case-en-turkish-test
     ;; TODO Can we achieve something like with-locale in CLJS?
     (mt/with-locale "tr"
       (is (= "id"
              (u/lower-case-en "ID"))))))

(deftest ^:parallel upper-case-en-test
  (is (= "ID"
         (u/upper-case-en "id"))))

#?(:clj
   (deftest upper-case-en-turkish-test
     (mt/with-locale "tr"
       (is (= "ID"
              (u/upper-case-en "id"))))))

(deftest ^:parallel capitalize-en-test
  (are [s expected] (= expected
                       (u/capitalize-en s))
    nil    nil
    ""     ""
    "ibis" "Ibis"
    "IBIS" "Ibis"
    "Ibis" "Ibis"))

#?(:clj
   (deftest capitalize-en-turkish-test
     (mt/with-locale "tr"
       (is (= "Ibis"
              (u/capitalize-en "ibis")
              (u/capitalize-en "IBIS")
              (u/capitalize-en "Ibis"))))))

(deftest ^:parallel email->domain-test
  (are [domain email] (= domain
                         (u/email->domain email))
    nil              nil
    "metabase.com"   "cam@metabase.com"
    "metabase.co.uk" "cam@metabase.co.uk"
    "metabase.com"   "cam.saul+1@metabase.com"))

(deftest ^:parallel email-in-domain-test
  (are [in-domain? email domain] (= in-domain?
                                    (u/email-in-domain? email domain))
    true  "cam@metabase.com"          "metabase.com"
    false "cam.saul+1@metabase.co.uk" "metabase.com"
    true  "cam.saul+1@metabase.com"   "metabase.com"))

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defspec pick-first-test 100
  (prop/for-all [coll (gen/list gen/small-integer)]
                (let [result (u/pick-first pos? coll)]
                  (or (and (nil? result)
                           (every? (complement pos?) coll))
                      (let [[x ys] result
                            [non-pos [m & rest]] (split-with (complement pos?) coll)]
                        (and (vector? result)
                             (= (count result) 2)
                             (pos? x)
                             (= x m)
                             (= ys (concat non-pos rest))))))))

(deftest ^:parallel normalize-map-test
  (testing "nil and empty maps return empty maps"
    (is (= {} (u/normalize-map nil)))
    (is (= {} (u/normalize-map {}))))

  (let [exp {:kebab-key 1
             :snake-key 2
             :camel-key 3}]
    (testing "Clojure maps have their keys normalized"
      (is (= exp (u/normalize-map {:kebab-key  1 :snake_key  2 :camelKey  3})))
      (is (= exp (u/normalize-map {"kebab-key" 1 "snake_key" 2 "camelKey" 3}))))

    #?(:cljs
       (testing "JS objects get turned into Clojure maps"
         (is (= exp (u/normalize-map #js {"kebab-key" 1 "snake_key" 2 "camelKey" 3})))))))

#?(:clj
   (deftest normalize-map-turkish-test
     (mt/with-locale "tr"
       (is (= {:bird "Toucan"}
              (u/normalize-map {:BIRD "Toucan"}))))))

(deftest ^:parallel or-with-test
  (testing "empty case"
    (is (= nil (u/or-with identity))))
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

(deftest ^:parallel dispatch-type-test
  (are [x expected] (= expected
                       (u/dispatch-type-keyword x))
    nil                                   :dispatch-type/nil
    "x"                                   :dispatch-type/string
    :x                                    :dispatch-type/keyword
    1                                     :dispatch-type/integer
    1.1                                   :dispatch-type/number
    {:a 1}                                :dispatch-type/map
    [1]                                   :dispatch-type/sequential
    #{:a}                                 :dispatch-type/set
    'str                                  :dispatch-type/symbol
    #"\d+"                                :dispatch-type/regex
    str                                   :dispatch-type/fn
    #?(:clj (Object.) :cljs (js/Object.)) :dispatch-type/*)
  (testing "All type keywords should derive from :dispatch-type/*"
    (are [x] (isa? (u/dispatch-type-keyword x) :dispatch-type/*)
      :dispatch-type/nil
      :dispatch-type/string
      :dispatch-type/keyword
      :dispatch-type/integer
      :dispatch-type/number
      :dispatch-type/map
      :dispatch-type/sequential
      :dispatch-type/set
      :dispatch-type/symbol
      :dispatch-type/regex
      :dispatch-type/fn
      :dispatch-type/*)))

(deftest ^:parallel assoc-dissoc-test
  (testing `lib.options/with-option-value
    (is (= {:foo "baz"}
           (u/assoc-dissoc {:foo "bar"} :foo "baz")))
    (is (= {}
           (u/assoc-dissoc {:foo "bar"} :foo nil)))
    (is (= {:foo false}
           (u/assoc-dissoc {:foo "bar"} :foo false))
        "false should be assoc'd")))

(deftest ^:parallel assoc-default-test
  (testing "nil map"
    (is (= {:x 0}
           (u/assoc-default nil :x 0))))
  (testing "empty map"
    (is (= {0 :x}
           (u/assoc-default {} 0 :x))))
  (testing "existing key"
    (is (= {:x 0}
           (u/assoc-default {:x 0} :x 1))))
  (testing "nil value"
    (is (= {:x 0}
           (u/assoc-default {:x 0} :y nil))))
  (testing "multiple defaults"
    (is (= {:x nil, :z 1}
           (u/assoc-default {:x nil} :x 0 :y nil :z 1))))
  (testing "multiple defaults for the same key"
    (is (= {:x nil, :y 1, :z 2}
           (u/assoc-default {:x nil} :x 0, :y nil, :y 1, :z 2, :x 3, :z 4))))
  (testing "preserves metadata"
    (is (= {:m true}
           (meta (u/assoc-default ^:m {:x 0} :y 1 :z 2 :a nil))))))

(deftest ^:parallel row-diff-test
  (testing "classify correctly"
    (is (= {:to-update [{:id 2 :name "c3"}]
            :to-delete [{:id 1 :name "c1"} {:id 3 :name "c3"}]
            :to-create [{:id -1 :name "-c1"}]
            :to-skip   [{:id 4 :name "c4"}]}
           (u/row-diff
            [{:id 1 :name "c1"}   {:id 2 :name "c2"} {:id 3 :name "c3"} {:id 4 :name "c4"}]
            [{:id -1 :name "-c1"} {:id 2 :name "c3"} {:id 4 :name "c4"}])))
    (is (= {:to-skip   [{:god_id 10, :name "Zeus", :job "God of Thunder"}]
            :to-delete [{:id 2, :god_id 20, :name "Odin", :job "God of Thunder"}]
            :to-update [{:god_id 30, :name "Osiris", :job "God of Afterlife"}]
            :to-create [{:god_id 40, :name "Perun", :job "God of Thunder"}]}
           (u/row-diff [{:id 1 :god_id 10 :name "Zeus" :job "God of Thunder"}
                        {:id 2 :god_id 20 :name "Odin" :job "God of Thunder"}
                        {:id 3 :god_id 30 :name "Osiris" :job "God of Fertility"}]
                       [{:god_id 10 :name "Zeus" :job "God of Thunder"}
                        {:god_id 30 :name "Osiris" :job "God of Afterlife"}
                        {:god_id 40 :name "Perun" :job "God of Thunder"}]
                       {:id-fn   :god_id
                        :to-compare #(dissoc % :id :god_id)})))))

(deftest ^:parallel empty-or-distinct?-test
  (are [xs expected] (= expected
                        (u/empty-or-distinct? xs))
    nil     true
    []      true
    '()     true
    #{}     true
    {}      true
    [1]     true
    [1 1]   false
    '(1 1)  false
    #{1}    true
    [1 2]   true
    [1 2 1] false))

(deftest ^:parallel round-to-decimals-test
  (are [decimal-place expected] (= expected
                                   (u/round-to-decimals decimal-place 1250.04253))
    5 1250.04253
    4 1250.0425
    3 1250.043
    2 1250.04
    1 1250.0
    0 1250.0))

(deftest conflicting-keys-test
  (testing "non intersecting maps should not return any conflicts"
    (is (= [] (u/conflicting-keys {:a 1 :b 2}
                                  {:c 3 :d 4}))))
  (testing "consistent maps should not return any conflicts"
    (is (= [] (u/conflicting-keys {:a 1 :b 2}
                                  {:b 2 :c 3}))))
  (testing "conflicting maps should return the correct conflicts"
    (is (= [:c :e] (u/conflicting-keys {:a 1 :b 2 :c 3 :e nil}
                                       {:b 2 :c 4 :d 5 :e 6})))))

(deftest map-all-test
  (testing "map-all with 1 collection is just map"
    (is (= [[0] [1] [2] [3] [4]] (u/map-all vector (range 5)))))
  (testing "map-all works with 3 collections"
    (is (=  [[0 0] [1 1] [2 2] [3 nil] [4 nil]] (u/map-all vector (range 5) (range 3)))))
  (testing "map-all works with higher arity"
    (is (= [[0 0 0] [1 1 1] [2 2 2] [3 nil 3] [nil nil 4]] (u/map-all vector (range 4) (range 3) (range 5))))))

#?(:clj
   (defspec map-all-returns-max-coll-input-size-test 1000
     (prop/for-all [xs (mg/generator [:sequential :int])
                    ys (mg/generator [:sequential :int])
                    zs (mg/generator [:sequential :int])]
       (let [total-result-count (count (u/map-all vector xs ys zs))]
         (= total-result-count (max (count xs) (count ys) (count zs)))))))

#?(:clj
   (defspec map-all-consumes-all-lengths-of-inputs-test 1000
     (prop/for-all [xs (mg/generator [:sequential [:int {:min -1000 :max 1000}]])
                    ys (mg/generator [:sequential [:int {:min -1000 :max 1000}]])
                    zs (mg/generator [:sequential [:int {:min -1000 :max 1000}]])]
       (let [expected (reduce + (u/map-all (fnil + 0 0 0) xs ys zs))
             sum (+ (reduce + 0 xs) (reduce + 0 ys) (reduce + 0 zs))]
         (= expected sum)))))

#?(:clj
   (deftest ^:parallel case-enum-test
     (testing "case does not work"
       (is (= 3 (case Month/MAY
                  Month/APRIL 1
                  Month/MAY   2
                  3))))
     (testing "case-enum works"
       (is (= 2 (u/case-enum Month/MAY
                  Month/APRIL 1
                  Month/MAY   2
                  3))))
     (testing "checks for type of cases"
       (is (thrown? Exception #"`case-enum` only works.*"
                    (u/case-enum Month/JANUARY
                      Month/JANUARY    1
                      DayOfWeek/SUNDAY 2))))))

(deftest ^:parallel truncate-string-to-byte-count-test
  (letfn [(truncate-string-to-byte-count [s byte-length]
            (let [truncated (#'u/truncate-string-to-byte-count s byte-length)]
              (is (<= (#'u/string-byte-count truncated) byte-length))
              (is (str/starts-with? s truncated))
              truncated))]
    (doseq [[s max-length->expected] {"12345"
                                      {1  "1"
                                       2  "12"
                                       3  "123"
                                       4  "1234"
                                       5  "12345"
                                       6  "12345"
                                       10 "12345"}

                                      "가나다라"
                                      {1  ""
                                       2  ""
                                       3  "가"
                                       4  "가"
                                       5  "가"
                                       6  "가나"
                                       7  "가나"
                                       8  "가나"
                                       9  "가나다"
                                       10 "가나다"
                                       11 "가나다"
                                       12 "가나다라"
                                       13 "가나다라"
                                       15 "가나다라"
                                       20 "가나다라"}}
            [max-length expected] max-length->expected]
      (testing (pr-str (list `lib.util/truncate-string-to-byte-count s max-length))
        (is (= expected
               (truncate-string-to-byte-count s max-length)))))))
