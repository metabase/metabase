(ns metabase.documents.search
  "The text of a document that the search index holds."
  (:require
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.search.config :as search.config]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn document->search-text
  "Extract the plain searchable text from a document's prose-mirror body for the search index.

  Receives the raw `:document` value as it comes off the ingestion query (a JSON string), which it parses and
  normalizes before `ast->text` reads it. Returns nil if it can't be parsed, so a
  malformed/oversized body never blocks the rest of the document (e.g. its name) from being indexed."
  [document]
  (when document
    (try
      (-> (cond-> document (string? document) json/decode+kw)
          prose-mirror/normalize-document
          prose-mirror/ast->text
          not-empty)
      (catch Throwable _ nil))))

(defmethod search.config/column->string [:document :document]
  [value _model _column]
  (or (document->search-text value) ""))
