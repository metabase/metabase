(ns metabase-enterprise.library-branching.format.manifest
  "The manifest: the databases, schemas, tables and fields of an instance, with their types, as the file
  [[path]] of a repository. It holds no data and no connection details. CI reads it for the semantic check."
  (:require
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(def path
  "The path of the manifest in a repository."
  ".metabase/manifest.yaml")

(def version
  "The manifest format that this code writes and reads."
  "library-branching-manifest/1")

(registry/def ::manifest
  "The manifest document. A field holds its nested fields under `:fields`."
  [:schema
   {:registry {::field [:map {:closed true}
                        [:name [:string {:min 1}]]
                        [:base_type {:optional true} [:string {:min 1}]]
                        [:effective_type {:optional true} [:string {:min 1}]]
                        [:fields {:optional true} [:vector [:ref ::field]]]]}}
   [:map {:closed true}
    [:format [:= version]]
    [:databases [:vector [:map {:closed true}
                          [:name [:string {:min 1}]]
                          [:engine {:optional true} [:string {:min 1}]]
                          [:tables {:optional true}
                           [:vector [:map {:closed true}
                                     [:name [:string {:min 1}]]
                                     [:schema {:optional true} [:string {:min 1}]]
                                     [:fields {:optional true} [:vector [:ref ::field]]]]]]]]]]])

(defn env
  "`{natural-key object}` of manifest document `doc`: `[database]` to `{:object :database}` (with `:engine`),
  `[database schema table]` to `{:object :table}`, and `[database schema table field ...]` to `{:object :field}` (with
  `:base-type` and `:effective-type`), a nested field under the key of its parent. A table with no schema has the
  schema nil."
  [_doc]
  {})

(defn decode
  "The environment that the manifest bytes `b` hold: `{:env (env doc)}`, or `{:findings [f ...]}`. Each finding has
  `:type` and `:reason`. The types: `:manifest-unreadable` (not one YAML document of the document model),
  `:manifest-invalid` (not a manifest document of [[version]]) and `:manifest-duplicate` (two entries with one
  natural key, with `:key`)."
  [b]
  {:env (env (codec/read-yaml b))})
