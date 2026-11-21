(ns metabase.glossary.core
  "API namespace for the glossary module. Every glossary write goes through the write functions of the model, whatever
  the caller (REST API, MCP tools, and so on)."
  (:require
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.models.glossary]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.util.malli :as mu]
   [potemkin :as p]))

(comment metabase.glossary.models.glossary/keep-me)

(p/import-vars
 [metabase.glossary.models.glossary
  create-glossary-entry!
  update-glossary-entry!
  delete-glossary-entry!])

(mu/defn entries :- [:sequential ::glossary.schema/glossary]
  "Every glossary entry, in term order."
  []
  (glossary.db/glossary-entries nil))
