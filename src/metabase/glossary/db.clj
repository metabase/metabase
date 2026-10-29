(ns metabase.glossary.db
  "Application database queries for the glossary module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.glossary.schema :as glossary.schema]
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

(mu/defn insert-glossary-entry!
  "Insert the Glossary `row` and return the inserted instance."
  [row :- ::glossary.schema/glossary.update]
  (t2/insert-returning-instance! :model/Glossary row))

(mu/defn glossary :- [:maybe ::glossary.schema/glossary]
  "The ::glossary.schema/glossary with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/Glossary :id [:auto/param id]))

(mu/defn update-glossary-entry!
  "Set the term and definition of the Glossary entry with `id`."
  [id         :- ms/PositiveInt
   term       :- :string
   definition :- :string]
  (t2/update! :model/Glossary id {:term term :definition definition}))

(mu/defn delete-glossary-entry!
  "Delete the Glossary entry with `id`."
  [id :- ms/PositiveInt]
  (t2/delete! :model/Glossary :id id))

(mu/defn glossary-entry-by-term
  "The Glossary entry for `term`, or nil."
  [term :- :string]
  (t2/select-one :model/Glossary :term term))

(mu/defn glossary-count
  "The number of Glossary entries."
  []
  (t2/count :model/Glossary))

(mu/defn glossary-definitions
  "A map of term to definition for the first `limit` Glossary entries ordered by `order-column` descending."
  [{:keys [order-column limit]} :- [:map {:closed true} [:order-column :keyword] [:limit ms/PositiveInt]]]
  (t2/select-fn->fn :term :definition :model/Glossary
                    {:order-by [[order-column :desc]]
                     :limit    limit}))

(mu/defn glossary-entry-terms
  "The ID and term of every Glossary entry."
  []
  (t2/select [:model/Glossary :id :term]))

(mu/defn untracked-glossary-entry-terms
  "The ID and term of every Glossary entry with no RemoteSyncObject."
  []
  (t2/select [:model/Glossary :id :term]
             {:where [:not [:exists ^:allow-subquery {:select [1]
                                                      :from   [:remote_sync_object]
                                                      :where  [:and
                                                               [:= :remote_sync_object.model_type "Glossary"]
                                                               [:= :remote_sync_object.model_id :glossary.id]]}]]}))
