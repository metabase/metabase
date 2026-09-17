(ns metabase.secrets.db
  "Application database queries for `:model/Secret`. Every function here is a direct Toucan 2 call with no additional
  logic, so no other namespace runs a Secret query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the secrets-only section at the bottom of
  this namespace.

  Secret rows hold encrypted credential material: never widen a select beyond what a caller narrowed to, and never add
  a primitive that returns columns (in particular `:value`) a call site did not already select."
  (:require
   [metabase.secrets.schema :as secrets.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Secrets a query applies to. Keys mirror the columns of `secret`: a scalar matches that value."
  [:map {:closed true}
   [:id      {:optional true} ms/PositiveInt]
   [:version {:optional true} :int]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::secrets.schema/secret.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::secrets.schema/secret.column
                                              [:tuple ::secrets.schema/secret.column [:enum :asc :desc]]]]]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/Secret columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-secret :- [:maybe ::secrets.schema/secret.partial]
  "The first Secret matching `opts`, or nil."
  ([]
   (select-one-secret nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-secret! :- ::secrets.schema/secret
  "Insert the Secret `row` and return the inserted instance."
  [row :- ::secrets.schema/secret.create]
  (t2/insert-returning-instance! :model/Secret row))

(mu/defn delete-secrets! :- :int
  "Delete every Secret matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/Secret (->args opts)))
