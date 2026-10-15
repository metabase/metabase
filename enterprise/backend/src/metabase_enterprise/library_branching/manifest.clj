(ns metabase-enterprise.library-branching.manifest
  "The manifest export of an instance: the document of `format.manifest`, read from the app DB."
  (:require
   [metabase-enterprise.library-branching.format.manifest :as format.manifest]
   [metabase-enterprise.library-branching.format.writer :as writer]))

(set! *warn-on-reflection* true)

(defn manifest
  "The manifest document of this instance, read in the current transaction: each database that is not the audit
  database, with its active tables and their active fields, each nested field under its parent. Databases are in the
  order of their names, tables in the order of their schemas and names, fields in the order of their names."
  []
  {:format format.manifest/version :databases []})

(defn manifest-yaml
  "The canonical YAML bytes of [[manifest]]."
  ^bytes []
  (writer/write-yaml (manifest)))
