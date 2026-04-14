(ns metabase.lib-be.json-schema
  "Create JSON schema for MBQL 5 queries based on Malli schema.

  Malli already has built-in functionality for this. Why not use it directly?

  First off because the Malli schema describes an internal form of MBQL which
  needs some tweaks before it can be used outside this codebase; see the
  metabase.models.serialization/export-mbql function. The main differences are:
  * internal uses :lib/uuid property, external should remove this.
  * internal uses integers for IDs, external should use strings or string tuples
    * database/card/segment/measure/snippet: string
    * table - [db-name, schema, table-name]
    * field - [db-name, schema, table-name, ...field-names]

  It sometimes emits branching nodes like :allOf, :anyOf, :oneOf with either
  one or zero children, which doesn't make any sense. These should be
  collapsed down. Empty conditions should be removed from these as well.

  We're also just working around a few straight up bugs in Malli's own JSON
  schema compiler.

  Our malli schema for what constitutes a valid JSON schema is a little stricter
  about what the keys have to look like; for instance types must always be
  keywords despite the fact that we're emitting them as JSON in the end so
  it doesn't really matter.

  This code was originally based on metabase.api.macros.defendpoint.open-api."
  (:require
   [malli.json-schema :as mjs]
   [medley.core :as m]
   [metabase.lib.schema :as schema]
   [metabase.util :as u]
   [metabase.util.json :as json-util]
   [metabase.util.performance :as mp]))

(defn- collapse-branches [schema k]
  ;; this happens when we use `[:and ... [:fn ...]]`, the `:fn` schema
  ;; gets converted into an empty object in :allOf
  (let [schema (update schema k (partial remove mp/empty?))]
    (case (count (k schema))
      1 (merge (dissoc schema k) (first (k schema)))
      0 (dissoc schema k)
      schema)))

(defn- update-properties [properties]
  (let [properties (dissoc properties :lib/uuid)]
    (zipmap (map u/qualified-name (keys properties))
            (vals properties))))

(defn- update-required [required]
  (if (map? required)
    (dissoc required :lib/uuid)
    (->> required
         (remove #{:lib/uuid})
         (map u/qualified-name))))

(defn- walk [node]
  (if (map? node)
    (-> node
        (m/update-existing :required update-required)
        (collapse-branches :allOf)
        (collapse-branches :anyOf)
        (collapse-branches :oneOf)
        (m/update-existing :properties update-properties))
    node))

(defn- replace-int-type [schema new-type]
  (dissoc (merge schema new-type) :minimum))

(defn- update-ids
  "internal MBQL uses pos-int for a bunch of IDs which need to be string/string-tuple."
  [definitions]
  (-> definitions
      (update "metabase.lib.schema.id.table" replace-int-type
              {:type "array"
               :prefixItems [{:type "string"} ; db name
                             {:anyOf [{:type "string"} {:type "null"}]} ; schema
                             {:type "string"}] ; table name
               :items false})
      (update "metabase.lib.schema.id.field" replace-int-type
              {:type "array"
               :prefixItems [{:type "string"} ; db name
                             {:anyOf [{:type "string"} {:type "null"}]} ; schema
                             {:type "string"}] ; table name
               :items {:type "string"}})
      (update "metabase.lib.schema.id.database" replace-int-type {:type "string"})
      (update "metabase.lib.schema.id.card" replace-int-type {:type "string"})
      (update "metabase.lib.schema.id.segment" replace-int-type {:type "string"})
      (update "metabase.lib.schema.id.measure" replace-int-type {:type "string"})
      (update "metabase.lib.schema.id.snippet" replace-int-type {:type "string"})))

;; due to a bug in malli, :cat schemas get compiled to an empty schema. this
;; wouldn't normally cause false negatives (just false positives) but there are
;; cases when a :cat schema lands in a :oneOf schema where it can't be allowed
;; to pass both branches; in that case a false positive becomes a false negative.
;; we should fix this in malli, but for the time being, we work around it.
(defn- remove-one-of-cat [definitions]
  (assoc definitions
         "metabase.lib.schema.expression.boolean" {}
         "metabase.lib.schema.expression.expression" {}
         "metabase.lib.schema.expression.orderable" {}
         "metabase.lib.schema.mbql-clause.clause" {}))

(defn make-schema
  "Generate a schema from Malli and apply fixes."
  []
  ;; here we generate a json schema and then make some modifications to adjust
  ;; it to "external MBQL". why not create an "external MBQL" malli schema? well
  ;; the references to things like "metabase.lib.schema.id.field" are spread out
  ;; all over the place so it would be hard to swap them all with our new
  ;; "externalized" field-id schema. if we turn it into json-schema then there's
  ;; only one place that those swaps need to happen.
  (let [schema (-> (mjs/transform ::schema/query)
                   ;; many of the updates are done below in `walk` if they need
                   ;; to work at any nesting level, but definitions are top-level
                   ;; and can be adjusted immediately.
                   (update :definitions update-ids)
                   (update :definitions remove-one-of-cat)
                   ;; this one breaks because the first oneOf branch is supposed to be for
                   ;; UUIDs and the second branch falls back to any non-blank string, but a
                   ;; UUID-shaped string will match both branches, so just check the latter.
                   (update :definitions assoc
                           "metabase.lib.schema.template-tag.id"
                           {"$ref" "#/definitions/metabase.lib.schema.common.non-blank-string"}))]
    (mp/postwalk walk schema)))

(defn write-schema
  "Print JSON Schema for MBQL5 queries, or write to a file if given."
  [{:keys [file]}]
  (let [json (json-util/encode (make-schema) {:pretty true})]
    (spit (or file "/dev/stdout") json)))

(comment (write-schema {:file "schema.json"}))
