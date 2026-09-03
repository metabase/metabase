(ns metabase.glossary.db
  "Application database queries for the glossary module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn glossary-entries
  "The Glossary entries whose term or definition contains `search` case-insensitively, or every
  entry when `search` is nil, in term order."
  [search]
  (t2/select :model/Glossary
             (cond-> {:order-by [[:term :asc]]}
               search (assoc :where (let [pattern (h2x/like-substring search)]
                                      [:or
                                       [:like [:lower :term] pattern]
                                       [:like [:lower :definition] pattern]])))))

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
