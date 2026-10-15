(ns metabase-enterprise.library-branching.format.manifest-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.manifest :as manifest]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut])
  (:import
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

(def golden-path
  "The manifest of the golden repository."
  "enterprise/backend/test_resources/library_branching/manifest.yaml")

(defn golden-bytes
  "The bytes of the manifest at [[golden-path]]."
  ^bytes []
  (Files/readAllBytes (.toPath (io/file golden-path))))

(def ^:private doc
  {:format    manifest/version
   :databases [{:name   "Sample Database"
                :engine "h2"
                :tables [{:schema "PUBLIC"
                          :name   "ORDERS"
                          :fields [{:name "TOTAL" :base_type "type/Float" :effective_type "type/Float"}
                                   {:name   "DATA"
                                    :base_type "type/JSON"
                                    :fields [{:name "a" :base_type "type/Text"
                                              :fields [{:name "b" :base_type "type/Integer"}]}]}]}
                         {:name "NOTES"}]}
               {:name "Aviary"}]})

(deftest ^:parallel env-test
  (testing "each database, table and field by its natural key; a nested field under the key of its parent"
    (is (= {["Sample Database"]                              {:object :database :engine "h2"}
            ["Sample Database" "PUBLIC" "ORDERS"]            {:object :table}
            ["Sample Database" "PUBLIC" "ORDERS" "TOTAL"]    {:object :field :base-type "type/Float"
                                                              :effective-type "type/Float"}
            ["Sample Database" "PUBLIC" "ORDERS" "DATA"]     {:object :field :base-type "type/JSON"}
            ["Sample Database" "PUBLIC" "ORDERS" "DATA" "a"] {:object :field :base-type "type/Text"}
            ["Sample Database" "PUBLIC" "ORDERS" "DATA" "a" "b"] {:object :field :base-type "type/Integer"}
            ["Sample Database" nil "NOTES"]                  {:object :table}
            ["Aviary"]                                       {:object :database}}
           (manifest/env doc)))))

(deftest ^:parallel decode-test
  (testing "the written manifest decodes to its environment"
    (is (= {:env (manifest/env doc)} (manifest/decode (writer/write-yaml doc)))))
  (testing "the golden manifest is canonical, and decodes"
    (let [b (golden-bytes)]
      (is (= (seq b) (seq (writer/write-yaml (codec/read-yaml b)))))
      (is (contains? (manifest/env (codec/read-yaml b)) ["Sample Database" "PUBLIC" "ORDERS" "TOTAL"]))
      (is (= {:env (manifest/env (codec/read-yaml b))} (manifest/decode b)))))
  (testing "a text that is not YAML"
    (is (= [:manifest-unreadable] (map :type (:findings (manifest/decode (utf-8 "a: [")))))))
  (testing "a document that is not a manifest, or of another version"
    (are [d] (= [:manifest-invalid] (map :type (:findings (manifest/decode (writer/write-yaml d)))))
      {:format manifest/version}
      {:format "library-branching-manifest/2" :databases []}
      {:format manifest/version :databases [{:name "X" :password "secret"}]}
      {:format manifest/version :databases [{:name "X" :tables [{:name "T" :fields [{:name ""}]}]}]}))
  (testing "two entries with one natural key"
    (is (= [{:type :manifest-duplicate :key ["Aviary"]}]
           (map #(select-keys % [:type :key])
                (:findings (manifest/decode (writer/write-yaml (update doc :databases conj {:name "Aviary"})))))))
    (is (= [["Sample Database" "PUBLIC" "ORDERS" "TOTAL"]]
           (map :key (:findings (manifest/decode (writer/write-yaml
                                                  (update-in doc [:databases 0 :tables 0 :fields]
                                                             conj {:name "TOTAL"})))))))))

(def ^:private name-gen (gen/elements ["A" "B" "C"]))

(def ^:private field-gen
  (gen/recursive-gen (fn [inner]
                       (gen/let [n name-gen, fields (gen/vector-distinct-by :name inner {:max-elements 3})]
                         (cond-> {:name n} (seq fields) (assoc :fields fields))))
                     (gen/fmap (fn [[n t]] (cond-> {:name n} t (assoc :base_type t)))
                               (gen/tuple name-gen (gen/elements [nil "type/Text" "type/Integer"])))))

(def ^:private manifest-gen
  "Manifest documents with unique natural keys."
  (gen/let [dbs (gen/vector-distinct-by
                 :name
                 (gen/let [n      name-gen
                           tables (gen/vector-distinct-by
                                   (juxt :schema :name)
                                   (gen/let [n      name-gen
                                             schema (gen/elements [nil "PUBLIC"])
                                             fields (gen/vector-distinct-by :name field-gen {:max-elements 3})]
                                     (cond-> {:name n} schema (assoc :schema schema) (seq fields) (assoc :fields fields)))
                                   {:max-elements 3})]
                   (cond-> {:name n} (seq tables) (assoc :tables tables)))
                 {:max-elements 3})]
    {:format manifest/version :databases dbs}))

(defn- entries
  "The number of databases, tables and fields of manifest document `d`."
  [d]
  (letfn [(fields [fs] (reduce + (count fs) (map (comp fields :fields) fs)))]
    (reduce + (count (:databases d))
            (for [db (:databases d)] (reduce + (count (:tables db)) (map (comp fields :fields) (:tables db)))))))

(defspec ^:parallel decode-gives-one-key-per-entry-test 200
  (prop/for-all [d manifest-gen]
    (let [{:keys [env findings]} (manifest/decode (writer/write-yaml d))]
      (and (nil? findings)
           (= (entries d) (count env))
           (= env (manifest/env d))))))

(def ^:private mutations
  [{:name   :nested-fields-dropped
    :doc    "A nested field is not in the environment, so every reference to it is red."
    :target `manifest/field-entries
    :edits  [[:replace '(field-entries k (:fields field)) nil]]}
   {:name   :duplicates-allowed
    :doc    "Two databases with one name merge in silence, so a reference can resolve against the wrong one."
    :target `manifest/decode
    :edits  [[:replace '(seq dups) nil]]}])

(deftest manifest-mutations-test
  (mut/check mutations {:tests [#'env-test #'decode-test]}))
