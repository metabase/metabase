(ns metabase.glossary.db
  "Application database queries for the glossary module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn glossary-entries
  "The Glossary entries whose term or definition contains `search` case-insensitively, or every
  entry when `search` is nil, in term order."
  [search :- [:maybe :string]]
  (t2/select :model/Glossary
             (cond-> {:order-by [[:term :asc]]}
               search (assoc :where (let [pattern (h2x/like-substring search)]
                                      [:or
                                       [:like [:lower :term] pattern]
                                       [:like [:lower :definition] pattern]])))))

(mu/defn insert-glossaries!
  "Insert the Glossary `rows` and return the inserted instances, in the order of `rows`."
  [rows :- [:sequential ::glossary.schema/glossary.create]]
  (app-db/insert-returning-instances! :model/Glossary rows))

(mu/defn glossary-entry
  "The Glossary entry with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Glossary :id id))

(mu/defn glossaries-by-id
  "A map of id to Glossary for the Glossary entries with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn identity :model/Glossary :id [:in ids]))

(mu/defn update-glossaries! :- :nil
  "Apply each of `updates`, the `:id` of a Glossary and the columns to change, with one statement for each set of columns
  that rows have in common."
  [updates :- [:sequential :map]]
  (app-db/update-grouped! :model/Glossary updates)
  nil)

(mu/defn delete-glossaries!
  "Delete the Glossary entries with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/Glossary :id [:in ids]))

(mu/defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn synced-glossary-items :- [:sequential ::glossary.schema/glossary]
  "The Glossary terms with `ids`, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (t2/select [:model/Glossary :id :term] :id [:in ids]))
