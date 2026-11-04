(ns metabase-enterprise.serialization.v2.schema-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.lib-be.json-schema :as js]
   [metabase.models.serialization :as serdes]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (com.github.erosb.jsonsKema FormatValidationPolicy JsonParser SchemaLoader Validator ValidatorConfig)))

(set! *warn-on-reflection* true)

(defn- model-schemas
  "Map each exported model that has a serialization schema to that schema."
  []
  (into {}
        (keep (fn [model-name]
                (t2/resolve-model (keyword "model" model-name))
                (when-let [schema (:schema (serdes/make-spec model-name {}))]
                  [model-name schema])))
        serdes.models/exported-models))

(defn- validator ^Validator [json-schema]
  (Validator/create (.load (SchemaLoader. (json/encode json-schema)))
                    (ValidatorConfig. FormatValidationPolicy/ALWAYS)))

(defn- json-error [^Validator v doc]
  (some-> (.validate v (.parse (JsonParser. (json/encode doc)))) str))

(defn- check-node [node]
  (when (map? node)
    (doseq [k [:oneOf :anyOf :allOf]
            :let [branches (k node)]
            :when branches]
      (is (< 1 (count branches)) (pr-str k branches))
      (is (not-any? empty? branches) (pr-str k branches)))
    (when-let [pattern (:pattern node)]
      (is (not (re-find #"\\[Az]" (str pattern))) (str pattern))))
  node)

(defn- baseline-docs []
  (for [^java.io.File f (file-seq (io/file (io/resource "serialization_baseline")))
        :when (and (.isFile f) (.endsWith (.getName f) ".yaml"))
        :let  [doc (yaml/parse-string (slurp f) :keywords false)]
        :when (map? doc)]
    [(.getPath f) (get (last (get doc "serdes/meta")) "model") doc]))

(deftest ^:parallel serdes-json-schemas-test
  (let [schemas    (model-schemas)
        validators (update-vals schemas (comp validator js/make-schema))]
    (testing "every exported model but settings has a schema"
      (is (= (set (remove #{"Setting"} serdes.models/exported-models))
             (set (keys schemas)))))
    (testing "it should remove malli quirks and Java-only regex anchors"
      (doseq [schema (vals schemas)]
        (walk/postwalk check-node (js/make-schema schema))))
    (testing "the JSON Schema accepts every baseline file the malli schema accepts"
      (doseq [[path model-name doc] (baseline-docs)
              :let  [schema (schemas model-name)]
              :when (and schema (mr/validate schema (json/decode+kw (json/encode doc))))]
        (testing path
          (is (nil? (json-error (validators model-name) doc))))))
    (testing "the JSON Schema rejects a key the malli schema does not declare"
      (let [[_ _ doc] (first (filter #(= "Collection" (second %)) (baseline-docs)))]
        (is (nil? (json-error (validators "Collection") doc)))
        (is (some? (json-error (validators "Collection") (assoc doc "undeclared" 1))))))))
