(ns metabase-enterprise.library-branching.instance.name-collation-test
  "Which snippet names the app DB and the engine take as one key. MySQL and MariaDB compare snippet names with
  utf8mb4_unicode_ci; Postgres and H2 compare them as they are. The engine compares names in one folded form on every
  app DB, and two names have one folded form iff utf8mb4_unicode_ci takes them as equal."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private one-key
  "Pairs of names that utf8mb4_unicode_ci and the engine both take as one key."
  [["Filter" "filter"] ["Filter" "FILTER"] ["Filter" "Fïlter"] ["Café" "Cafe"] ["Café" "Café"]
   ["ﬁlter" "filter"] ["Ｆｉｌｔｅｒ" "Filter"] ["x²" "x2"] ["Ⅳ" "IV"]
   ["İstanbul" "istanbul"] ["Ångström" "Angstrom"] ["ｶ" "カ"] ["が" "か"]
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

(defn- weights->key
  "The weights in the hex form of WEIGHT_STRING, with trailing space weights (0209) removed, one char per weight."
  ^String [^String hex]
  (let [weights (map #(Integer/parseInt (apply str %) 16) (partition 4 hex))]
    (apply str (map char (reverse (drop-while #{0x0209} (reverse weights)))))))

(defn- app-db-key
  "The utf8mb4_unicode_ci weights of `s` by the app DB, in the form of `weights->key`."
  ^String [^String s]
  (weights->key (:w (t2/query-one ["SELECT HEX(WEIGHT_STRING(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)) AS w"
                                   s]))))

(defn- app-db-equal?
  "True iff the app DB takes `a` and `b` as equal under utf8mb4_unicode_ci."
  [a b]
  (= 1 (long (:e (t2/query-one ["SELECT (CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci) = (CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci) AS e"
                                a b])))))

(defn- bmp-weights
  "`{code-point key}` for every BMP code point that is not a surrogate, by the app DB, in the form of `weights->key`."
  []
  (let [digits (str "(SELECT 0 AS d" (str/join (map #(str " UNION ALL SELECT " %) (range 1 16))) ")")]
    (into {}
          (map (fn [{:keys [n w]}] [(long n) (weights->key w)]))
          (t2/query [(str "SELECT n, HEX(WEIGHT_STRING(CONVERT(CHAR(n USING utf32) USING utf8mb4) COLLATE utf8mb4_unicode_ci)) AS w"
                          " FROM (SELECT a.d + 16 * b.d + 256 * c.d + 4096 * e.d AS n"
                          " FROM " digits " a, " digits " b, " digits " c, " digits " e) t"
                          " WHERE n < 55296 OR n > 57343")]))))

(deftest every-bmp-character-test
  (when (collation?)
    (testing (str "the folded form of each BMP character is its utf8mb4_unicode_ci weights; app DB " (mdb/db-type))
      (let [db     (bmp-weights)
            differ (into (sorted-map)
                         (comp (remove (fn [[cp k]] (= k (snapshot/fold-name (String. (Character/toChars (int cp)))))))
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
