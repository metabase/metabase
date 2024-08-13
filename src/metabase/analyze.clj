(ns metabase.analyze
  "API namespace for the `metabase.analyze` module."
  (:require
   [metabase.analyze.classifiers.category]
   [metabase.analyze.classifiers.core]
   [metabase.analyze.classifiers.name]
   [metabase.analyze.fingerprint.fingerprinters]
   [metabase.analyze.fingerprint.schema]
   [metabase.analyze.query-results]
   [potemkin :as p]))

(comment
  metabase.analyze.classifiers.category/keep-me
  metabase.analyze.classifiers.core/keep-me
  metabase.analyze.classifiers.name/keep-me
  metabase.analyze.fingerprint.fingerprinters/keep-me
  metabase.analyze.fingerprint.schema/keep-me
  metabase.analyze.query-results/keep-me)

(p/import-vars
  [metabase.analyze.classifiers.category
   auto-list-cardinality-threshold
   category-cardinality-threshold]
  [metabase.analyze.classifiers.core
   run-classifiers]
  [metabase.analyze.classifiers.name
   infer-entity-type-by-name
   infer-semantic-type-by-name]
  [metabase.analyze.fingerprint.fingerprinters
   col-wise
   constant-fingerprinter
   fingerprint-fields]
  [metabase.analyze.fingerprint.schema
   Fingerprint]
  [metabase.analyze.query-results
   ResultsMetadata
   insights-rf])
