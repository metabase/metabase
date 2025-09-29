(ns metabase-enterprise.representations.import
  "Import functionality for Metabase entities from human-readable representations")

(defmulti persist!
  "Ingest a validated representation and create/update the entity in the database.
   Dispatches on the :type field of the representation."
  {:arglists '[[entity ref-index]]}
  (fn [entity _ref-index] (:type entity)))

(defmulti yaml->toucan
  "Convert a validated representation into data suitable for creating/updating an entity.
   Returns a map with keys matching the Toucan model fields.
   Does NOT insert into the database - just transforms the data.
   Dispatches on the :type field of the representation."
  {:arglists '[[entity ref-index]]}
  (fn [entity _ref-index] (:type entity)))
