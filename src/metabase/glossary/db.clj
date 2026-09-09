(ns metabase.glossary.db
  "Application database queries for the glossary module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn glossary-entries :- [:sequential ::glossary.schema/glossary]
  "The Glossary entries whose term or definition contains `search` case-insensitively, or every
  entry when `search` is nil, in term order."
  [search :- [:maybe :string]]
  (t2/select :model/Glossary
             (cond-> {:order-by [[:term :asc]]}
               search (assoc :where (let [pattern (h2x/like-substring search)]
                                      [:or
                                       [:like [:lower :term] pattern]
                                       [:like [:lower :definition] pattern]])))))

(mu/defn insert-glossary-entry! :- ::glossary.schema/glossary
  "Insert the Glossary `row` and return the inserted instance."
  [row :- ::glossary.schema/glossary.update]
  (t2/insert-returning-instance! :model/Glossary row))

(mu/defn glossary-entry :- [:maybe ::glossary.schema/glossary]
  "The Glossary entry with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Glossary :id id))

(mu/defn update-glossary-entry! :- :int
  "Set the term and definition of the Glossary entry with `id`."
  [id         :- ms/PositiveInt
   term       :- :string
   definition :- :string]
  (t2/update! :model/Glossary id {:term term :definition definition}))

(mu/defn delete-glossary-entry! :- :int
  "Delete the Glossary entry with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Glossary :id id))

(def ^:private UsersById
  "Rows returned by [[users-by-id]]."
  (mut/select-keys ::users.schema/user [:id :email :first_name :last_name :common_name]))

(mu/defn users-by-id :- [:map-of ::lib.schema.id/user UsersById]
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn glossary-entry-by-term :- [:maybe ::glossary.schema/glossary]
  "The Glossary entry for `term`, or nil."
  [term :- :string]
  (t2/select-one :model/Glossary :term term))
