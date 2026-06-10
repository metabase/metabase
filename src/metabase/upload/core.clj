(ns metabase.upload.core
  (:require
   [metabase.upload.db]
   [metabase.upload.impl]
   [metabase.upload.parsing]
   [metabase.upload.types]
   [potemkin :as p]))

(comment
  metabase.upload.db/keep-me
  metabase.upload.impl/keep-me
  metabase.upload.parsing/keep-me
  metabase.upload.types/keep-me)

(p/import-vars
 [metabase.upload.db
  current-database]
 [metabase.upload.impl
  can-create-upload?
  create-csv-upload!
  delete-upload!
  model-hydrate-based-on-upload
  update-action-schema
  update-csv!]
 [metabase.upload.parsing
  ;; Locale-aware parsing settings (number separators etc.).
  get-settings
  ;; Returns a parser fn for a given upload column type keyword.
  upload-type->parser]
 [metabase.upload.types
  ;; Maps a Metabase base-type keyword to the most specific upload type.
  base-type->upload-type
  ;; Infers column types from a sequence of rows (strings); returns concrete upload type keywords.
  column-types-from-rows])
