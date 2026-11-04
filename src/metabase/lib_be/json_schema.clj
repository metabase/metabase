(ns metabase.lib-be.json-schema
  "Create JSON schema for MBQL 5 queries based on Malli schema.

  Malli already has built-in functionality for this. Why not use it directly?

  We're working around a few bugs in Malli's own JSON schema compiler.
  It sometimes emits branching nodes like :allOf, :anyOf, :oneOf with either
  one or zero children, which doesn't make any sense. These should be
  collapsed down. Empty conditions should be removed from these as well.

  Our malli schema for what constitutes a valid JSON schema is a little stricter
  about what the keys have to look like; for instance types must always be
  keywords despite the fact that we're emitting them as JSON in the end so
  it doesn't really matter."
  (:require
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [medley.core :as m]
   [metabase.lib.schema :as schema]
   [metabase.util :as u]
   [metabase.util.json :as json-util]
   [metabase.util.performance :as mp]))

(defn- collapse-branches [schema k]
  ;; this happens when we use `[:and ... [:fn ...]]`, the `:fn` schema
  ;; gets converted into an empty object in :allOf; for example ::literal/integer
  ;; in Malli is [:or :int [:fn u.number/bigint?]] which Malli compiles to
  ;; {:anyOf [{:type "integer"}]} but it should just become {:type "integer"}
  (let [schema (update schema k (partial remove mp/empty?))]
    (case (count (k schema))
      1 (merge (dissoc schema k) (first (k schema)))
      0 (dissoc schema k)
      schema)))

(defn- stringify [required]
  (if (sequential? required)
    (map u/qualified-name required)
    required))

(defn- prefix-items
  "Spell a malli `:tuple` the way JSON Schema 2020-12 does."
  [node]
  (if (vector? (:items node))
    (-> node
        (assoc :prefixItems (:items node) :items false)
        (dissoc :additionalItems))
    node))

(defn- ecma-pattern
  "Replace the Java-only anchors of a regex pattern with ones JSON Schema validators accept."
  [pattern]
  (cond-> pattern
    (or (string? pattern) (instance? java.util.regex.Pattern pattern))
    (-> str (str/replace #"^\\A" "^") (str/replace #"\\z$" (constantly "$")))))

(defn- any-of
  "Malli's branching schemas pass when any branch does, so a `oneOf` whose branches overlap is an `anyOf`."
  [node]
  (if-let [branches (:oneOf node)]
    (-> node (dissoc :oneOf) (update :anyOf #(concat % branches)))
    node))

(defn- update-schema-fields [node]
  (if (map? node)
    (-> node
        any-of
        prefix-items
        (m/update-existing :description #(cond-> % (record? %) str))
        (m/update-existing :pattern ecma-pattern)
        (m/update-existing :required stringify)
        (collapse-branches :allOf)
        (collapse-branches :anyOf)
        (m/update-existing :properties #(mp/update-keys % u/qualified-name)))
    node))

;; due to a bug in malli, :cat schemas get compiled to an empty schema. this
;; wouldn't normally cause false negatives (just false positives) but there are
;; cases when a :cat schema lands in a :oneOf schema where it can't be allowed
;; to pass both branches; in that case a false positive becomes a false negative.
;; we should fix this in malli, but for the time being, we work around it.
(defn- remove-one-of-cat [definitions]
  (reduce (fn [definitions k]
            (cond-> definitions
              (contains? definitions k) (assoc k {})))
          definitions
          ["metabase.lib.schema.expression.boolean"
           "metabase.lib.schema.expression.expression"
           "metabase.lib.schema.expression.orderable"
           "metabase.lib.schema.mbql-clause.clause"]))

(def ^:private external-id-definitions
  "The portable table and field ids, which are `:cat` schemas that malli compiles to empty ones."
  (let [database {"$ref" "#/definitions/metabase.lib.schema.id.external-database"}
        prefix   [database {:type ["string" "null"]} {:type "string"}]]
    {"metabase.lib.schema.id.external-table" {:type "array" :prefixItems prefix :items false :minItems 3}
     "metabase.lib.schema.id.external-field" {:type "array" :prefixItems prefix :items {:type "string"} :minItems 4}}))

(defn- fix-schema
  [json-schema]
  (let [definitions (:definitions json-schema)
        schema      (cond-> json-schema
                      ;; definitions are top-level and can be adjusted immediately, other updates are done in
                      ;; `update-schema-fields` because they need to work at any nesting level.
                      definitions (update :definitions remove-one-of-cat)
                      definitions (update :definitions merge (mp/select-keys external-id-definitions (keys definitions)))
                      ;; the first oneOf branch is supposed to be for UUIDs and the second branch falls back to any
                      ;; non-blank string, but a UUID-shaped string matches both branches, so just check the latter.
                      (contains? definitions "metabase.lib.schema.template-tag.id")
                      (update :definitions assoc
                              "metabase.lib.schema.template-tag.id"
                              {"$ref" "#/definitions/metabase.lib.schema.common.non-blank-string"}))]
    (mp/postwalk update-schema-fields schema)))

(defn make-schema
  "Generate a JSON Schema from a Malli schema, by default the external query one, and apply fixes."
  ([]
   (make-schema ::schema/external-query))
  ([schema]
   ;; here we generate a json schema and then make some modifications to adjust
   ;; it to "external MBQL". why not create an "external MBQL" malli schema? well
   ;; the references to things like "metabase.lib.schema.id.field" are spread out
   ;; all over the place so it would be hard to swap them all with our new
   ;; "externalized" field-id schema. if we turn it into json-schema then there's
   ;; only one place that those swaps need to happen.
   (fix-schema (mjs/transform schema))))

(defn write-schema
  "Print JSON Schema for MBQL5 queries, or write to a file if given."
  [{:keys [file]}]
  (let [json (json-util/encode (make-schema) {:pretty true})]
    (spit (or file "/dev/stdout") json)))

(comment (write-schema {:file "schema.json"}))
