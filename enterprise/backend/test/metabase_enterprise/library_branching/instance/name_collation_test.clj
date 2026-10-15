(ns metabase-enterprise.library-branching.instance.name-collation-test
  "Which snippet names the app DB and the engine take as one key. MySQL and MariaDB compare snippet names with
  utf8mb4_unicode_ci; Postgres and H2 compare them as they are. The engine compares names in one folded form on every
  app DB, and two names have one folded form iff utf8mb4_unicode_ci takes them as equal."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.collation :as collation]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users) features.tu/with-features)

(def ^:private one-key
  "Pairs of names that utf8mb4_unicode_ci and the engine both take as one key."
  [["Filter" "filter"] ["Filter" "FILTER"] ["Filter" "Fïlter"] ["Café" "Cafe"] ["Cafe\u0301" "Café"]
   ["ﬁlter" "filter"] ["Ｆｉｌｔｅｒ" "Filter"] ["x²" "x2"] ["Ⅳ" "IV"]
   ["İstanbul" "istanbul"] ["\u212Bngström" "Angstrom"] ["ｶ" "カ"] ["が" "か"]
   ["Ǆ" "DŽ"] ["Straße" "Strasse"] ["σ" "ς"] ["Filter " "Filter"] ["Filter\u00A0" "Filter"] ["Œuvre" "Oeuvre"]
   ["a\u200Bb" "ab"] ["😀" "😃"] ["a😀" "a🦄"]])

(def ^:private two-keys
  "Pairs of names that utf8mb4_unicode_ci and the engine both take as two keys."
  [["Straße" "Strase"] ["Æther" "AEther"] ["Øre" "Ore"] ["ı" "i"] [" Filter" "Filter"] ["ð" "d"]
   ["Łódź" "Lodz"] ["Filter-1" "Filter_1"] ["Ä" "AE"] ["😀" "\uFFFD"] ["a b" "ab"] ["一" "丁"]])

(defn- engine-one-key?
  [a b]
  (= (snapshot/fold-name a) (snapshot/fold-name b)))

(defn- app-db-one-key?
  "True iff the app DB finds the snippet named `a` by the name `b`."
  [a b]
  (mt/with-temp [:model/NativeQuerySnippet {id :id} {:name a}]
    (t2/exists? :model/NativeQuerySnippet :id id :name b)))

(defn- collation? []
  (contains? #{:mysql :mariadb} (mdb/db-type)))

(deftest engine-name-keys-test
  (doseq [[a b] one-key]
    (testing (pr-str a b)
      (is (engine-one-key? a b))))
  (doseq [[a b] two-keys]
    (testing (pr-str a b)
      (is (not (engine-one-key? a b))))))

(deftest app-db-name-keys-test
  (testing (str "app DB " (mdb/db-type))
    (doseq [[a b] one-key]
      (testing (pr-str a b)
        (is (= (collation?) (app-db-one-key? a b)))))
    (doseq [[a b] two-keys]
      (testing (pr-str a b)
        (is (not (app-db-one-key? a b)))))))

(deftest snippet-name-collation-test
  (when (collation?)
    (testing "MySQL and MariaDB compare snippet names with utf8mb4_unicode_ci"
      (is (= "utf8mb4_unicode_ci"
             (:c (t2/query-one [(str "SELECT COLLATION_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = "
                                     "DATABASE() AND TABLE_NAME = 'native_query_snippet' AND COLUMN_NAME = 'name'")])))))))

(defn- hex->weights
  "The weights of the hex form of WEIGHT_STRING."
  [^String hex]
  (mapv #(Integer/parseInt (apply str %) 16) (partition 4 hex)))

(defn- weights->key
  "`weights` with trailing space weights (0209) removed, one char per weight."
  ^String [weights]
  (apply str (map char (reverse (drop-while #{0x0209} (reverse weights))))))

(defn- app-db-key
  "The utf8mb4_unicode_ci weights of `s` by the app DB, in the form of `weights->key`."
  ^String [^String s]
  (weights->key (hex->weights (:w (t2/query-one ["SELECT HEX(WEIGHT_STRING(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)) AS w"
                                                 s])))))

(defn- app-db-equal?
  "True iff the app DB takes `a` and `b` as equal under utf8mb4_unicode_ci."
  [a b]
  (= 1 (long (:e (t2/query-one ["SELECT (CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci) = (CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci) AS e"
                                a b])))))

(defn- bmp-weights
  "`{code-point [weight]}` for every BMP code point that is not a surrogate: its utf8mb4_unicode_ci weights by the app
  DB."
  []
  (let [digits (str "(SELECT 0 AS d" (str/join (map #(str " UNION ALL SELECT " %) (range 1 16))) ")")]
    (into (sorted-map)
          (map (fn [{:keys [n w]}] [(long n) (hex->weights w)]))
          (t2/query [(str "SELECT n, HEX(WEIGHT_STRING(CONVERT(CHAR(n USING utf32) USING utf8mb4) COLLATE utf8mb4_unicode_ci)) AS w"
                          " FROM (SELECT a.d + 16 * b.d + 256 * c.d + 4096 * e.d AS n"
                          " FROM " digits " a, " digits " b, " digits " c, " digits " e) t"
                          " WHERE n < 55296 OR n > 57343")]))))

(defn- table-text
  "The text of `collation/table-resource` for `weights` (`{code-point [weight]}`, sorted): one line for each run of
  code points in a row that have one weight sequence (`CODE*N`), or whose weight sequences differ only in a last weight
  that goes up by one (`CODE+N`)."
  [weights]
  (let [runs (reduce (fn [runs [cp ws]]
                       (let [{:keys [start first-ws n step] :as run} (peek runs)
                             longer #(conj (pop runs) (assoc run :n (inc n) :step %))]
                         (cond
                           (or (nil? run) (not= cp (+ start n)))  (conj runs {:start cp :first-ws ws :n 1})
                           (and (= ws first-ws) (not= :inc step)) (longer :same)
                           (and (seq ws) (= (count ws) (count first-ws)) (= (pop ws) (pop first-ws))
                                (= (peek ws) (+ (peek first-ws) n)) (not= :same step))
                           (longer :inc)
                           :else                                  (conj runs {:start cp :first-ws ws :n 1}))))
                     []
                     weights)]
    (str/join (concat ["# The primary weights of each BMP code point under utf8mb4_unicode_ci (UCA 4.0.0), from WEIGHT_STRING of\n"
                       "# MySQL and MariaDB. The format is in the docstring of collation/table-resource. Generated by\n"
                       "# name-collation-test/table-text: do not edit.\n"]
                      (for [{:keys [start first-ws n step]} runs]
                        (str (format "%04X" start)
                             (when (< 1 n) (str (if (= :inc step) "+" "*") n))
                             (str/join (map #(format " %04X" %) first-ws))
                             "\n"))))))

(deftest weight-table-test
  (when (collation?)
    (testing (str "the weight table of the fold is the one of the app DB " (mdb/db-type) "; to make it again, spit "
                  "(table-text (bmp-weights)) on MySQL into enterprise/backend/src/" collation/table-resource)
      (is (= (table-text (bmp-weights)) (slurp (io/resource collation/table-resource)))))))

(deftest every-bmp-character-test
  (when (collation?)
    (testing (str "the folded form of each BMP character is its utf8mb4_unicode_ci weights; app DB " (mdb/db-type))
      (let [db     (bmp-weights)
            differ (into (sorted-map)
                         (comp (remove (fn [[cp ws]] (= (weights->key ws)
                                                        (snapshot/fold-name (String. (Character/toChars (int cp)))))))
                               (take 20))
                         db)]
        (is (= 63488 (count db)))
        (is (= {} differ))))))

(deftest supplementary-characters-test
  (when (collation?)
    (testing "utf8mb4_unicode_ci gives every supplementary character one weight, and so does the fold"
      (doseq [cp [0x10000 0x1F600 0x1F984 0x20000 0x2FFFF 0xE0001 0x10FFFF]
              :let [s (String. (Character/toChars (int cp)))]]
        (testing (format "U+%X" cp)
          (is (= (app-db-key s) (snapshot/fold-name s))))))))

(defspec names-fold-to-their-weights-test 300
  ;; On MySQL and MariaDB: the folded form of a name is its utf8mb4_unicode_ci weights.
  (prop/for-all [s lb.tu/unicode-name-gen]
    (or (not (collation?))
        (= (app-db-key s) (snapshot/fold-name s)))))

(defspec one-key-iff-app-db-equal-test 300
  ;; On MySQL and MariaDB: two names are one key iff utf8mb4_unicode_ci takes them as equal.
  (prop/for-all [[a b] lb.tu/unicode-name-pair-gen]
    (or (not (collation?))
        (= (app-db-equal? a b) (engine-one-key? a b)))))

(deftest snippet-name-clash-test
  (testing (str "two snippets whose names differ only in case and accents; app DB " (mdb/db-type))
    (mt/with-temp [:model/NativeQuerySnippet _ {:name "Filter"}]
      (if (collation?)
        (testing "MySQL and MariaDB refuse the second snippet"
          (mt/with-model-cleanup [:model/NativeQuerySnippet]
            (is (thrown? Exception (t2/insert! :model/NativeQuerySnippet {:name       "fïlter"
                                                                          :content    "x"
                                                                          :creator_id (mt/user->id :rasta)})))))
        (testing "Postgres and H2 accept the second snippet"
          (mt/with-temp [:model/NativeQuerySnippet {id :id} {:name "fïlter"}]
            (is (t2/exists? :model/NativeQuerySnippet :id id))))))
    (testing "the engine finds the clash on every app DB"
      (let [a (engine.tu/eid "a")
            b (engine.tu/eid "b")]
        (is (= [{:rule :unique-key :kind :snippet :key "Filter" :ids #{a b}}]
               (validate/validate {a (engine.tu/item :snippet "Filter" nil)
                                   b (engine.tu/item :snippet "fïlter" nil)})))))))
