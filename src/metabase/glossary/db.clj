(ns metabase.glossary.db
  "Application database queries for `:model/Glossary`. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the glossary-only section at the bottom
  of this namespace."
  (:require
   [metabase.glossary.schema :as glossary.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Glossary entries a query applies to. Keys mirror the columns of `glossary`: a scalar matches that value and
  a set matches any of its values."
  [:map {:closed true}
   [:id   {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:term {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::glossary.schema/glossary.column]]
    [:order-by {:optional true} [:sequential ::glossary.schema/glossary.column]]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/Glossary columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-glossary :- [:maybe ::glossary.schema/glossary.partial]
  "The first Glossary entry matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::opts]]
  (apply t2/select-one (->model columns) (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-glossary! :- ::glossary.schema/glossary
  "Insert the Glossary `row` and return the inserted instance."
  [row :- ::glossary.schema/glossary.update]
  (t2/insert-returning-instance! :model/Glossary row))

(mu/defn update-glossaries! :- :int
  "Apply `changes` to every Glossary entry matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::glossary.schema/glossary.update]
  (apply t2/update! :model/Glossary (conj (->kv-args opts) changes)))

(mu/defn delete-glossaries! :- :int
  "Delete every Glossary entry matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/Glossary (->args opts)))

;;; ------------------------------- Queries used only by the glossary module -------------------------------

(mu/defn select-glossary-entries-matching-search :- [:sequential ::glossary.schema/glossary]
  "The Glossary entries whose term or definition contains `search` case-insensitively, or every entry when `search`
  is nil, in term order."
  [search :- [:maybe :string]]
  (t2/select :model/Glossary
             (cond-> {:order-by [[:term :asc]]}
               search (assoc :where (let [pattern (h2x/like-substring search)]
                                      [:or
                                       [:like [:lower :term] pattern]
                                       [:like [:lower :definition] pattern]])))))

(mu/defn users-by-id
  "A map of User id to the id, email, and name of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))
