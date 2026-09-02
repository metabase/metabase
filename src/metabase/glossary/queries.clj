(ns metabase.glossary.queries
  "Application database queries for the glossary module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn glossary-entries
  "The Glossary entries matching the Honey SQL `where` clause (every entry when nil), in term order."
  [where]
  (t2/select :model/Glossary (cond-> {:order-by [[:term :asc]]}
                               where (assoc :where where))))

(defn hydrate-creator
  "Hydrate `:creator` onto `entries`."
  [entries]
  (t2/hydrate entries :creator))

(defn insert-glossary-entry!
  "Insert the Glossary `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Glossary row))

(defn glossary-entry
  "The Glossary entry with `id`, or nil."
  [id]
  (t2/select-one :model/Glossary :id id))

(defn update-glossary-entry!
  "Set the term and definition of the Glossary entry with `id`."
  [id term definition]
  (t2/update! :model/Glossary id {:term term :definition definition}))

(defn delete-glossary-entry!
  "Delete the Glossary entry with `id`."
  [id]
  (t2/delete! :model/Glossary :id id))

(defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(defn glossary-entry-by-term
  "The Glossary entry for `term`, or nil."
  [term]
  (t2/select-one :model/Glossary :term term))
