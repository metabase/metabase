(ns metabase.content-translation.db
  "Application database queries for `:model/ContentTranslation`. Every function here is a direct Toucan 2 call with
  no additional logic, so no other namespace in the module runs a query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]."
  (:require
   [metabase.content-translation.schema :as content-translation.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which ContentTranslations a query applies to. Keys mirror the columns of `content_translation`."
  [:map {:closed true}
   [:locale {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::content-translation.schema/content-translation.column]]
    [:order-by {:optional true} [:sequential ::content-translation.schema/content-translation.column]]]])

(defn- filter-clause
  [column value]
  (case column
    ;; `locale` arrives from a request parameter, so it is bound as a SQL parameter rather than compiled into the
    ;; query.
    :locale [:= :locale [:auto/param value]]
    (if (set? value)
      [:in column value]
      [:= column value])))

(defn- where-clause
  [filters]
  (into [:and] (map (fn [[column value]] (filter-clause column value))) filters))

(defn- order-by-clause
  [columns]
  (mapv (fn [column] [column :asc]) columns))

(defn- ->model
  [columns]
  (if (seq columns)
    (into [:model/ContentTranslation] columns)
    :model/ContentTranslation))

(defn- ->honeysql
  [{:keys [order-by] :as opts}]
  (cond-> {:where (where-clause (dissoc opts :columns :order-by))}
    (seq order-by) (assoc :order-by (order-by-clause order-by))))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-content-translations :- [:sequential ::content-translation.schema/content-translation]
  "The ContentTranslations matching `opts`."
  ([]
   (select-content-translations nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (t2/select (->model columns) (->honeysql opts))))
