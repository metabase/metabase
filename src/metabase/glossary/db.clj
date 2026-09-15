(ns metabase.glossary.db
  "Application database queries for the glossary module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
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
  ;; `search` needs no marker: `like-substring` escapes it into a string, and HoneySQL binds the
  ;; pattern it builds. Marking the pattern instead would bind the whole `[:escape ...]` form as one
  ;; value and lose the `ESCAPE` clause.
  (t2/select :model/Glossary
             (cond-> {:order-by [[:term :asc]]}
               search (assoc :where (let [pattern (h2x/like-substring search)]
                                      [:or
                                       [:like [:lower :term] pattern]
                                       [:like [:lower :definition] pattern]])))))

(mu/defn insert-glossary-entry!
  "Insert the Glossary `row` and return the inserted instance."
  [row :- ::glossary.schema/glossary.update]
  (t2/insert-returning-instance! :model/Glossary row))

(mu/defn glossary-entry
  "The Glossary entry with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Glossary :id (long id)))

(mu/defn update-glossary-entry!
  "Set the term and definition of the Glossary entry with `id`."
  [id         :- ms/PositiveInt
   term       :- :string
   definition :- :string]
  ;; `term` and `definition` come from a request body, so they are bound as parameters rather than
  ;; compiled into the statement.
  (t2/update! :model/Glossary id {:term       [:auto/param term]
                                  :definition [:auto/param definition]}))

(mu/defn delete-glossary-entry!
  "Delete the Glossary entry with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Glossary :id (long id)))

(mu/defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                    :id [:in (mapv long user-ids)]))

(mu/defn glossary-entry-by-term
  "The Glossary entry for `term`, or nil."
  [term :- :string]
  ;; `term` comes from a request, so it is bound as a parameter rather than compiled into the query.
  (t2/select-one :model/Glossary {:where [:= :term [:auto/param term]]}))
