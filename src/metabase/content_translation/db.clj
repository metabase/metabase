(ns metabase.content-translation.db
  "Application database queries for `:model/ContentTranslation`. Every function here is a direct Toucan 2 call with
  no additional logic, so no other namespace in the module runs a query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]."
  (:require
   [malli.util :as mut]
   [metabase.content-translation.schema :as content-translation.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which ContentTranslations a query applies to. Keys mirror the columns of `content_translation`. `:locale`
  arrives from a request parameter, so it is bound as a SQL parameter rather than compiled into the query."
  [:map {:closed true}
   [:locale {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::content-translation.schema/content-translation.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::content-translation.schema/content-translation.column
                                              [:tuple ::content-translation.schema/content-translation.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/ContentTranslation columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-content-translations :- [:sequential ::content-translation.schema/content-translation.partial]
  "The ContentTranslations matching `opts`."
  ([]
   (select-content-translations nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-content-translations! :- :int
  "Insert the ContentTranslation `rows`, returning the number inserted."
  [rows :- [:sequential (mut/select-keys ::content-translation.schema/content-translation.update [:locale :msgid :msgstr])]]
  (t2/insert! :model/ContentTranslation rows))

(mu/defn delete-content-translations! :- :int
  "Delete every ContentTranslation matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/ContentTranslation (->args opts)))
