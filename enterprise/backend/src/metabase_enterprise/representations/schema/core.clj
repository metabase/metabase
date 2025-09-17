(ns metabase-enterprise.representations.schema.core
  "Core schema registry for representations validation.
   Maps versioned type strings to their corresponding Malli schemas."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.representations.schema.v0.collection :as v0-coll]
   [metabase-enterprise.representations.schema.v0.database :as v0-db]
   [metabase-enterprise.representations.schema.v0.document :as v0-doc]
   [metabase-enterprise.representations.schema.v0.question :as v0-question]
   [metabase-enterprise.representations.schema.v0.snippet :as v0-snippet]
   [metabase-enterprise.representations.schema.v0.transform :as v0-transform]
   [metabase.util.malli :as mu]))

;;; ------------------------------------ Type Registry ------------------------------------

(def ^:private type->schema
  "Registry mapping type strings to their corresponding schemas.
   Keys are strings like 'v0/question', values are qualified keywords."
  {:v0/question ::v0-question/question
   ;; :v0/model ::v0-card/model
   ;; :v0/metric ::v0-card/metric
   :v0/collection ::v0-coll/collection
   :v0/database ::v0-db/database
   :v0/document ::v0-doc/document
   :v0/snippet ::v0-snippet/snippet
   :v0/transform ::v0-transform/transform})

;;; ------------------------------------ Public API ------------------------------------

(def ^:private default-version "v0")

(defn- versioned-type
  [type-str]
  (if (str/includes? type-str "/")
    (keyword type-str)
    (keyword default-version type-str)))

(defn schema-for-type
  "Returns the Malli schema for a given type string. Returns nil if type is not recognized."
  [type-str]
  (if (str/includes? type-str "/")
    (get type->schema type-str)
    (get type->schema (str default-version "/" type-str))))

(defn validate
  "Validates a representation against its schema based on the type field.

   The type field can be either:
   - Simple: 'question', 'collection' (defaults to v0)
   - Versioned: 'v0/question', 'v1/collection' (explicit version)

   The schemas themselves expect simple types, so we strip the version
   before validation if present.

   Handles both string and keyword keys from YAML parsing.

   Throws an exception if validation fails.
   Returns the representation if validation passes."
  [representation]
  (if-let [type-name (:type representation)]
    (let [type-with-version (versioned-type type-name)
          schema (schema-for-type type-with-version)]
      (if-not schema
        (throw (ex-info (str "Unknown type: " type-name) {:type type-name}))
        (->> (assoc representation :type type-with-version)
             (mu/validate-throw schema))))
    (throw (ex-info "Missing required field: type" {:representation representation}))))
