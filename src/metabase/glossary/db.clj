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

(defn- filter-clause
  [column value]
  (if (set? value)
    [:in column value]
    [:= column value]))

(defn- where-clause
  [filters]
  (into [:and] (map (fn [[column value]] (filter-clause column value))) filters))

(defn- order-by-clause
  [columns]
  (mapv (fn [column] [column :asc]) columns))

(defn- ->model
  [columns]
  (if (seq columns)
    (into [:model/Glossary] columns)
    :model/Glossary))

(defn- ->honeysql
  [{:keys [order-by] :as opts}]
  (cond-> {:where (where-clause (dissoc opts :columns :order-by))}
    (seq order-by) (assoc :order-by (order-by-clause order-by))))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-glossary :- [:maybe ::glossary.schema/glossary]
  "The first Glossary entry matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::opts]]
  (t2/select-one (->model columns) (->honeysql opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-glossary! :- ::glossary.schema/glossary
  "Insert the Glossary `row` and return the inserted instance."
  [row :- ::glossary.schema/glossary.update]
  (t2/insert-returning-instance! :model/Glossary row))

(mu/defn update-glossaries! :- :int
  "Apply `changes` to every Glossary entry matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::glossary.schema/glossary.update]
  (t2/update! :model/Glossary (->honeysql opts) changes))

(mu/defn delete-glossaries! :- :int
  "Delete every Glossary entry matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (t2/delete! :model/Glossary (->honeysql opts)))

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
