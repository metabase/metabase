(ns metabase-enterprise.library-branching.snapshot-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [clojure.test.check.random :as random]
   [clojure.test.check.rose-tree :as rose]
   [metabase-enterprise.library-branching.collation :as collation]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private metric-id "IW8kbqZVaMxdGtCM2F4U6")
(def ^:private collection-id "cOlQuErIeS0ExAmPlE2x1")
(def ^:private orders-key ["Sample Database" "PUBLIC" "ORDERS"])

(def ^:private metric
  {:kind  :metric
   :name  "Total Revenue"
   :place collection-id
   :refs  #{[:source-table [:env orders-key]] [:card collection-id]}
   :attrs {:display "scalar"}})

(def ^:private collection
  {:kind :collection :name "Revenue" :place nil :refs #{} :attrs {}})

(def ^:private example
  {collection-id collection
   metric-id     metric
   orders-key    {:kind :published-table :name "Orders" :place collection-id :refs #{} :attrs {}}})

(defn- valid? [s] (mr/validate ::snapshot/snapshot s))

(deftest ^:parallel may-contain-test
  (testing "may-contain has one entry for each kind, and names only kinds"
    (is (= snapshot/kinds (set (keys snapshot/may-contain))))
    (is (every? #(set/subset? % snapshot/kinds) (vals snapshot/may-contain)))))

(deftest ^:parallel snapshot-schema-test
  (testing "a snapshot of a collection, a metric and a published table validates"
    (is (valid? example))
    (is (valid? {})))
  (testing "an item has exactly the keys :kind :name :place :refs :attrs"
    (is (not (valid? (assoc-in example [metric-id :id] 12))))
    (is (not (valid? (update example metric-id dissoc :attrs))))
    (is (not (valid? (update example collection-id dissoc :place)))))
  (testing "the kind is in the closed set"
    (is (not (valid? (assoc-in example [metric-id :kind] :dashboard)))))
  (testing "the name is a non-empty string"
    (is (not (valid? (assoc-in example [metric-id :name] ""))))
    (is (not (valid? (assoc-in example [metric-id :name] nil)))))
  (testing "a place is an identity or nil"
    (is (not (valid? (assoc-in example [metric-id :place] 12))))
    (is (not (valid? (assoc-in example [metric-id :place] "not-an-entity-id")))))
  (testing "a reference is a [role target] pair; a target is an identity or [:env natural-key]"
    (is (not (valid? (assoc-in example [metric-id :refs] #{[:card 12]}))))
    (is (not (valid? (assoc-in example [metric-id :refs] #{[:card [:env []]]}))))
    (is (not (valid? (assoc-in example [metric-id :refs] #{["card" metric-id]}))))
    (is (not (valid? (assoc-in example [metric-id :refs] [[:card metric-id]])))))
  (testing "attribute keys are keywords"
    (is (not (valid? (assoc-in example [metric-id :attrs] {"display" "scalar"})))))
  (testing "a published table has a table natural key as its identity; every other kind has an entity id"
    (is (not (valid? (-> example (dissoc orders-key) (assoc "oRdErStAbLeEnTiTyId00" (get example orders-key))))))
    (is (not (valid? (-> example (dissoc metric-id) (assoc ["Sample Database" "PUBLIC" "REVENUE"] metric)))))
    (is (not (valid? (-> example (dissoc orders-key) (assoc ["Sample Database" "ORDERS"] (get example orders-key))))))
    (is (valid? (-> example (dissoc orders-key) (assoc ["Sample Database" nil "ORDERS"] (get example orders-key)))))))

(def ^:private entity-id-like-gen
  "Strings near the NanoID form: 19 to 23 characters, mostly of the NanoID alphabet."
  (gen/fmap (partial apply str)
            (gen/bind (gen/choose 19 23)
                      #(gen/vector (gen/frequency [[20 (gen/elements "ABCXYZabcxyz0189_-")]
                                                   [1 (gen/elements [\. \space \~ \é \newline])]])
                                   %))))

(defspec entity-id-is-the-nano-id-schema-test 300
  ;; `::snapshot/entity-id` is a copy, because babashka cannot load `metabase.util.malli.schema`.
  (prop/for-all [s (gen/one-of [entity-id-like-gen lb.tu/entity-id-gen gen/string])]
    (= (mr/validate ms/NanoIdString s) (mr/validate ::snapshot/entity-id s))))

(deftest ^:parallel compare-identities-test
  (testing "entity ids come before table keys; entity ids by string order; table keys part by part, nil first"
    (is (= ["AAAAAAAAAAAAAAAAAAAAA" "zzzzzzzzzzzzzzzzzzzzz"
            ["Aviary" nil "NESTS"] ["Aviary" "BIRDS" "NESTS"] ["Sample Database" "PUBLIC" "ORDERS"]]
           (sort snapshot/compare-identities
                 [["Sample Database" "PUBLIC" "ORDERS"] "zzzzzzzzzzzzzzzzzzzzz" ["Aviary" "BIRDS" "NESTS"]
                  "AAAAAAAAAAAAAAAAAAAAA" ["Aviary" nil "NESTS"]])))))

(defspec compare-identities-is-a-total-order-test 100
  (prop/for-all [ids (gen/vector (gen/one-of [lb.tu/entity-id-gen lb.tu/table-key-gen]) 0 20)]
    (let [sorted (sort snapshot/compare-identities ids)]
      (and (every? (fn [[a b]] (<= (snapshot/compare-identities a b) 0)) (partition 2 1 sorted))
           (every? (fn [a] (zero? (snapshot/compare-identities a a))) ids)
           (every? (fn [[a b]] (= (Integer/signum (int (snapshot/compare-identities a b)))
                                  (- (Integer/signum (int (snapshot/compare-identities b a))))))
                   (for [a ids b ids] [a b]))))))

(defspec well-formed-snapshots-validate-test 200
  (prop/for-all [s (lb.tu/well-formed-snapshot-gen)]
    (and (valid? s) (lb.tu/well-formed? s))))

(defspec arbitrary-snapshots-validate-test 200
  (prop/for-all [s (lb.tu/arbitrary-snapshot-gen)]
    (valid? s)))

(defn- samples
  "200 values of generator `g` at size 30, from fixed seeds."
  [g]
  (mapv #(gen/generate g 30 %) (range 200)))

(defn- depth
  [s id]
  (count (take-while some? (iterate #(:place (get s %)) (:place (get s id))))))

(defn- sibling-clash?
  [s]
  (some #(< 1 %) (vals (frequencies (map (juxt :place :kind :name) (vals s))))))

(defn- one-key? [a b] (= (snapshot/fold-name a) (snapshot/fold-name b)))

(deftest ^:parallel fold-name-test
  (testing "two names are one key iff utf8mb4_unicode_ci takes them as equal"
    (testing "case, accents, compatibility forms"
      (are [a b] (one-key? a b)
        "Filter"        "filter"
        "FILTER"        "filter"
        "Fïlter"        "filter"
        "Fi\u0308lter"  "Fïlter"
        "Café"          "cafe"
        "ﬁlter"         "filter"
        "Ｆｉｌｔｅｒ"  "filter"
        "x²"            "x2"
        "İstanbul"      "istanbul"))
    (testing "expansions, final sigma, trailing spaces, ignorable characters, supplementary characters"
      (are [a b] (one-key? a b)
        "Straße"          "Strasse"
        "σ"               "ς"
        "Œuvre"           "OEuvre"
        "Filter "         "Filter"
        "Filter \u00A0 "  "Filter"
        "a\u200Bb"        "ab"
        "\u200Dab\uFEFF"  "ab"
        "😀"              "😃"
        "x🦄y"            "x😀y"))
    (testing "letters of their own, leading and inner spaces, punctuation, the soft hyphen, U+FFFD"
      (are [a b] (not (one-key? a b))
        "ı"       "i"
        "Łódź"    "Lodz"
        "Æther"   "AEther"
        "Øre"     "Ore"
        "Straße"  "Strase"
        " Filter" "Filter"
        "a b"     "ab"
        "a-b"     "a_b"
        "a\u00ADb" "ab"
        "😀"      "\uFFFD"
        "一"      "丁"))))

(defspec fold-name-ignores-trailing-spaces-test 200
  (prop/for-all [s   lb.tu/unicode-name-gen
                 pad (gen/vector (gen/elements [\space \u00A0 \u3000]) 1 3)]
    (one-key? s (apply str s pad))))

(defspec fold-name-ignores-ignorable-characters-test 200
  (prop/for-all [s lb.tu/unicode-name-gen
                 i gen/nat
                 c (gen/elements [\u200B \u200C \u200D \u2060 \uFEFF])]
    (let [cps (vec (.toArray (.codePoints ^String s)))
          i   (mod i (inc (count cps)))]
      (one-key? s (str (lb.tu/code-points->string (subvec cps 0 i)) c (lb.tu/code-points->string (subvec cps i)))))))

(defspec fold-name-takes-supplementary-characters-as-one-test 200
  (prop/for-all [s  lb.tu/unicode-name-gen
                 cp (gen/choose 0x10000 0x10FFFF)]
    (one-key? s (str/replace s #"[\x{10000}-\x{10FFFF}]" (String. (Character/toChars (int cp)))))))

(defspec fold-name-ignores-ascii-case-test 200
  (prop/for-all [s gen/string-ascii]
    (one-key? (u/lower-case-en s) (u/upper-case-en s))))

(def fold-mutations
  "Each mutation removes one rule of the name fold."
  [{:name   :case-and-accents-only
    :doc    "The fold before utf8mb4_unicode_ci: NFKD, no combining mark, lower case."
    :target `snapshot/fold-name
    :edits  [[:replace '(collation/primary-key s)
              '(.toLowerCase ^String (clojure.string/replace (java.text.Normalizer/normalize s java.text.Normalizer$Form/NFKD)
                                                             #"\p{M}" "")
                             java.util.Locale/ROOT)]]}
   {:name   :no-pad-space
    :doc    "Trailing spaces count."
    :target `collation/primary-key
    :edits  [[:replace '(= space-weight (int (.charAt sb (dec end)))) false]]}
   {:name   :supplementary-by-code-point
    :doc    "Each supplementary character has weights of its own."
    :target `collation/code-point-weights
    :edits  [[:replace '(str (char supplementary-weight)) '(String. (Character/toChars (int cp)))]]}
   {:name   :no-expansions
    :doc    "A character has only its first weight, so the sharp s and ss differ."
    :target `collation/code-point-weights
    :edits  [[:replace '(aget table cp) '(let [^String w (aget table cp)] (if (seq w) (subs w 0 1) w))]]}
   {:name   :no-ignorables
    :doc    "An ignorable character counts as itself."
    :target `collation/code-point-weights
    :edits  [[:replace '(aget table cp) '(let [w (aget table cp)] (if (= "" w) (str (char cp)) w))]]}])

(deftest fold-mutations-test
  (mut/check fold-mutations {:tests [#'fold-name-test #'fold-name-ignores-trailing-spaces-test
                                     #'fold-name-ignores-ignorable-characters-test
                                     #'fold-name-takes-supplementary-characters-as-one-test
                                     #'fold-name-ignores-ascii-case-test]}))

(deftest ^:parallel unique-key-test
  (testing "a name key compares in its folded form, any other key as it is"
    (let [table {:snippet {:path [:name] :name? true} :metric {:path [:attrs :path]}}]
      (is (= (snapshot/fold-name "filter") (snapshot/unique-key table {:kind :snippet :name "Fïlter"})))
      (is (= "A.py" (snapshot/unique-key table {:kind :metric :name "M" :attrs {:path "A.py"}})))
      (is (nil? (snapshot/unique-key table {:kind :metric :name "M" :attrs {}})))
      (is (nil? (snapshot/unique-key table {:kind :collection :name "C"}))))))

(deftest ^:parallel arbitrary-snapshot-gen-faults-test
  (testing "the arbitrary generator gives each kind of structural fault"
    (let [ss (samples (lb.tu/arbitrary-snapshot-gen))]
      (is (some (complement lb.tu/acyclic?) ss) "a containment cycle")
      (is (some (complement lb.tu/places-inside?) ss) "a place outside the snapshot")
      (is (some (complement lb.tu/refs-closed?) ss) "a dangling reference")
      (is (some (complement lb.tu/kinds-fit?) ss) "a kind that its container cannot contain")
      (is (some (complement lb.tu/unique-keys?) ss) "two snippets with one name"))))

(deftest ^:parallel well-formed-snapshot-gen-coverage-test
  (testing "the well-formed generator gives the structures that the format and the engine must handle"
    (let [ss (samples (lb.tu/well-formed-snapshot-gen))]
      (is (some (fn [s] (some #(<= 3 (depth s %)) (keys s))) ss) "an item three levels deep")
      (is (some sibling-clash? ss) "two siblings with one name and one kind")
      (is (some #(= snapshot/kinds (set (map :kind (vals %)))) ss) "every kind in one snapshot")
      (is (some (fn [s] (some (fn [[_ target]] (lb.tu/env-target? target)) (mapcat :refs (vals s)))) ss)
          "a reference to the environment")
      (is (some (fn [s] (some (fn [[id {:keys [refs]}]] (some #(= [id] (rest %)) refs)) s)) ss)
          "an item that refers to itself")))
  (testing "options restrict the kinds at the root level and in containers"
    (let [ss (samples (lb.tu/well-formed-snapshot-gen {:root-kinds #{:collection}
                                                       :may-contain {:collection #{:collection :metric}}}))]
      (is (every? (fn [s] (every? #(or (:place %) (= :collection (:kind %))) (vals s))) ss))
      (is (every? (fn [s] (every? #{:collection :metric} (map :kind (vals s)))) ss))
      (is (every? #(lb.tu/well-formed? % {:collection #{:collection :metric}}) ss))))
  (testing "a snapshot has at most min(size, :max-items) items"
    (is (every? #(<= (count %) 5) (map #(gen/generate (lb.tu/well-formed-snapshot-gen) 5 %) (range 50))))
    (is (every? #(<= (count %) 3) (samples (lb.tu/well-formed-snapshot-gen {:max-items 3}))))))

(defn- smallest-failure
  "Shrinks the first value of generator `g` (size 30, seeds 0 to 199) that fails `pred` as test.check does: it moves
  to the first shrink that still fails, until no shrink fails."
  [g pred]
  (loop [tree (some (fn [seed]
                      (let [tree (gen/call-gen g (random/make-random seed) 30)]
                        (when-not (pred (rose/root tree)) tree)))
                    (range 200))]
    (if-let [child (first (remove #(pred (rose/root %)) (rose/children tree)))]
      (recur child)
      (rose/root tree))))

(deftest ^:parallel well-formed-snapshot-gen-shrinks-test
  (testing "a failure on a snapshot with an item two levels deep shrinks to three items, with no references and no
            attributes, under a root collection"
    ;; The kinds of the items below the root depend on the order of the kinds: the first kind that a collection can
    ;; contain, :action, contains nothing, so the chain goes through the first kind that contains one.
    (let [smallest (smallest-failure (lb.tu/well-formed-snapshot-gen)
                                     (fn [s] (not-any? #(<= 2 (depth s %)) (keys s))))]
      (is (= 3 (count smallest)))
      (is (every? #(and (empty? (:refs %)) (empty? (:attrs %))) (vals smallest)))
      (is (= [:collection] (keep #(when (nil? (:place %)) (:kind %)) (vals smallest)))))))

(deftest ^:parallel well-formed-snapshot-gen-timing-test
  (testing "1,000 well-formed snapshots of size up to 30"
    (let [g     (lb.tu/well-formed-snapshot-gen)
          start (System/nanoTime)
          ss    (mapv #(gen/generate g (mod % 31) %) (range 1000))
          ms    (/ (- (System/nanoTime) start) 1e6)]
      (log/infof "Generated %d well-formed snapshots (%d items) in %.0f ms"
                 (count ss) (reduce + (map count ss)) ms)
      (is (= 1000 (count ss))))))
