(ns metabase.driver.impl-test
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.impl :as driver.impl]
   [metabase.test.util.async :as tu.async]
   [metabase.util :as u])
  (:import
   (com.vladsch.flexmark.ast Heading)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Document Node)))

(set! *warn-on-reflection* true)

(deftest ^:parallel driver->expected-namespace-test
  (testing "expected namespace for a non-namespaced driver should be `metabase.driver.<driver>`"
    (is (= 'metabase.driver.sql-jdbc
           (#'driver.impl/driver->expected-namespace :sql-jdbc))))
  (testing "for a namespaced driver it should be the namespace of the keyword"
    (is (= 'metabase.driver.impl-test
           (#'driver.impl/driver->expected-namespace ::toucans)))))

(deftest load-driver-namespace-race-condition-test
  (testing "Make sure we don't report a driver as being registered if its namespace is in the process of being loaded (#13114)"
    (alter-var-root #'driver.impl/hierarchy underive ::race-condition-test :metabase.driver/driver)
    ;; basic idea for this test is simulate loading a driver namespace on a different thread and have it register
    ;; itself immediately. Then on another thread we should call `the-initialized-driver`, but it shouldn't return
    ;; until the namespace has completed loading.
    (tu.async/with-open-channels [started-loading-chan (a/promise-chan)]
      (let [finished-loading (atom false)]
        (with-redefs [driver.impl/require-driver-ns (fn [_]
                                                      (driver/register! ::race-condition-test)
                                                      (a/>!! started-loading-chan :start)
                                                      (Thread/sleep 100)
                                                      (reset! finished-loading true))]
          ;; fire off a separate thread that will start loading the driver
          (future (driver/the-initialized-driver ::race-condition-test))
          (tu.async/wait-for-result started-loading-chan 500)
          (is (= ::race-condition-test
                 (driver/the-initialized-driver ::race-condition-test)))
          (is (= true
                 @finished-loading)))))))

;;;; [[driver-multimethods-in-changelog-test]]

(defn- parse-drivers-changelog
  "Create a mapping of version to appropriate changelog file section.
  All level 2 headings containing version and sections following are collected. This approach could handle changes from
  version 0.42.0 onwards, as prior to this version, this information was stored at github wiki. Output has a following
  shape {\"0.47.0\" \"...insert-into!...\" ...}."
  []
  (let [changelog     (slurp (io/file "docs/developers-guide/driver-changelog.md"))
        parser        (.build (Parser/builder))
        document      (.parse ^Parser parser ^String changelog)]
    (loop [[child & children] (.getChildren ^Document document)
           version->text      {}
           last-version       nil]
      (cond (nil? child)
            version->text

            (and (instance? Heading child)
                 (= 2 (.getLevel ^Heading child)))
            (let [heading-str      (str (.getChars ^Node child))
                  new-last-version (re-find #"(?<=## Metabase )\d+\.\d+\.\d+" heading-str)]
              (if (some? new-last-version)
                (recur children version->text new-last-version)
                (recur children version->text nil)))

            (some? last-version)
            (recur children
                   (update version->text last-version str (.getChars ^Node child))
                   last-version)

            :else
            (recur children version->text last-version)))))

(defn- collect-metadatas
  "List metadata for all defmultis of driver namespaces."
  []
  (let [nss (filter #(re-find #"^metabase\.driver" (name %)) u/metabase-namespace-symbols)]
    (apply require nss)
    (->> (map ns-publics nss)
         (mapcat vals)
         (filter #(instance? clojure.lang.MultiFn (deref %)))
         (map meta))))

(defn- older-than-42?
  [version]
  (when-let [version (drop 1 (re-find #"(\d+)\.(\d+)\.(\d+)" (str version)))]
    (< (compare (mapv #(Integer/parseInt %) version)
                [0 42 0])
       0)))

(deftest driver-multimethods-in-changelog-test
  (let [metadatas             (collect-metadatas)
        version->section-text (parse-drivers-changelog)]
    (doseq [m metadatas]
      (when-not (:changelog-test/ignore m)
        (let [method (str (:ns m) "/" (:name m))]
          (testing (str method " has `:added` metadata set")
            (is (contains? m :added)))
          (when-not (older-than-42? (:added m))
            (testing (str method " is mentioned in changelog for version " (:added m))
              (is (re-find (re-pattern (str "\\Q" (:name m) "\\E"))
                           (get version->section-text (:added m) ""))))))))))
