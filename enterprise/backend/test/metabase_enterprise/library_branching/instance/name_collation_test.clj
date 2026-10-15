(ns metabase-enterprise.library-branching.instance.name-collation-test
  "Which snippet names the app DB and the engine take as one key. MySQL and MariaDB compare snippet names with
  utf8mb4_unicode_ci; Postgres and H2 compare them as they are. The engine compares names in one folded form on every
  app DB."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private one-key
  "Pairs of names that utf8mb4_unicode_ci and the engine both take as one key."
  [["Filter" "filter"] ["Filter" "FILTER"] ["Filter" "Fïlter"] ["Café" "Cafe"] ["Café" "Café"]
   ["ﬁlter" "filter"] ["Ｆｉｌｔｅｒ" "Filter"] ["x²" "x2"] ["Ⅳ" "IV"]
   ["İstanbul" "istanbul"] ["Ångström" "Angstrom"] ["ｶ" "カ"] ["が" "か"]
   ["Ǆ" "DŽ"]])

(def ^:private two-keys
  "Pairs of names that utf8mb4_unicode_ci and the engine both take as two keys."
  [["Straße" "Strase"] ["Æther" "AEther"] ["Øre" "Ore"] ["ı" "i"] [" Filter" "Filter"] ["ð" "d"]
   ["Łódź" "Lodz"] ["Filter-1" "Filter_1"] ["Ä" "AE"]])

(def ^:private collation-only
  "Pairs of names that utf8mb4_unicode_ci takes as one key and the engine takes as two keys."
  [["Straße" "Strasse"] ["σ" "ς"] ["Filter " "Filter"] ["Œuvre" "Oeuvre"] ["a​b" "ab"]
   ["😀" "😃"]])

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
  (doseq [[a b] (concat two-keys collation-only)]
    (testing (pr-str a b)
      (is (not (engine-one-key? a b))))))

(deftest app-db-name-keys-test
  (testing (str "app DB " (mdb/db-type))
    (doseq [[a b] one-key]
      (testing (pr-str a b)
        (is (= (collation?) (app-db-one-key? a b)))))
    (doseq [[a b] two-keys]
      (testing (pr-str a b)
        (is (not (app-db-one-key? a b)))))
    (doseq [[a b] collation-only]
      (testing (pr-str a b)
        (is (= (collation?) (app-db-one-key? a b)))))))

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
