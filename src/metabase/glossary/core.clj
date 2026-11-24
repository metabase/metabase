(ns metabase.glossary.core
  "API namespace for the glossary module."
  (:require
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.util.malli :as mu]))

(mu/defn entries :- [:sequential ::glossary.schema/glossary]
  "Every glossary entry, in term order."
  []
  (glossary.db/glossary-entries nil))
