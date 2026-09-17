(ns metabase.embedding.db
  "Application database queries for `:model/EmbeddingTheme`. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace runs an EmbeddingTheme query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the embedding-only section at the bottom of
  this namespace."
  (:require
   [metabase.embedding.schema :as embedding.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which EmbeddingThemes a query applies to. Keys mirror the columns of `embedding_theme`: a scalar matches that
  value."
  [:map {:closed true}
   [:id         {:optional true} ms/PositiveInt]
   [:is_default {:optional true} :boolean]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::embedding.schema/embedding-theme.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::embedding.schema/embedding-theme.column
                                              [:tuple ::embedding.schema/embedding-theme.column [:enum :asc :desc]]]]]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/EmbeddingTheme columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-embedding-themes :- [:sequential ::embedding.schema/embedding-theme.partial]
  "The EmbeddingThemes matching `opts`."
  ([]
   (select-embedding-themes nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-embedding-theme :- [:maybe ::embedding.schema/embedding-theme.partial]
  "The first EmbeddingTheme matching `opts`, or nil."
  ([]
   (select-one-embedding-theme nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn embedding-theme-exists? :- :boolean
  "Whether an EmbeddingTheme matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (apply t2/exists? :model/EmbeddingTheme (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-embedding-theme! :- ::embedding.schema/embedding-theme
  "Insert the EmbeddingTheme `row` and return the inserted instance."
  [row :- ::embedding.schema/embedding-theme.create]
  (t2/insert-returning-instance! :model/EmbeddingTheme row))

(mu/defn insert-embedding-themes! :- :int
  "Insert the EmbeddingTheme `rows`, returning the number inserted."
  [rows :- [:sequential ::embedding.schema/embedding-theme.create]]
  (t2/insert! :model/EmbeddingTheme rows))

(mu/defn update-embedding-themes! :- :int
  "Apply `changes` to every EmbeddingTheme matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::embedding.schema/embedding-theme.update]
  (apply t2/update! :model/EmbeddingTheme (conj (->kv-args opts) changes)))

(mu/defn delete-embedding-themes! :- :int
  "Delete every EmbeddingTheme matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/EmbeddingTheme (->args opts)))

;;; ------------------------------------- Queries used only by the embedding module -------------------------------------

(mu/defn count-embedded-cards
  "Number of Cards that have embedding enabled."
  []
  (t2/count :model/Card :enable_embedding true))

(mu/defn count-embedded-dashboards
  "Number of Dashboards that have embedding enabled."
  []
  (t2/count :model/Dashboard :enable_embedding true))
