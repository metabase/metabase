(ns metabase.osi.db
  "Application database queries for `:model/OsiAiContext`. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the osi-only section at the bottom of
  this namespace."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.osi.schema :as osi.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which OsiAiContexts a query applies to. Keys mirror the columns of `osi_ai_context`, which has no surrogate
  `:id`; a row's key is the pair of `:entity_type` and `:entity_local_id`."
  [:map {:closed true}
   [:entity_type     {:optional true} :string]
   [:entity_local_id {:optional true} ms/PositiveInt]])

(mr/def ::opts
  "The filters above plus the columns to select, the order to return them in, and a page of rows."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::osi.schema/osi-ai-context.column]]
    [:order-by {:optional true} [:sequential ::osi.schema/osi-ai-context.column]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/OsiAiContext columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-osi-ai-contexts :- [:sequential ::osi.schema/osi-ai-context]
  "The OsiAiContexts matching `opts`."
  ([]
   (select-osi-ai-contexts nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-osi-ai-context :- [:maybe ::osi.schema/osi-ai-context]
  "The first OsiAiContext matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::opts]]
  (apply t2/select-one (->model columns) (->args opts)))

(mu/defn count-osi-ai-contexts :- :int
  "The number of OsiAiContexts matching `opts`."
  ([]
   (count-osi-ai-contexts nil))
  ([opts :- [:maybe ::opts]]
   (apply t2/count :model/OsiAiContext (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn update-osi-ai-contexts! :- :int
  "Apply `changes` to every OsiAiContext matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::osi.schema/osi-ai-context.update]
  (apply t2/update! :model/OsiAiContext (conj (->kv-args opts) changes)))

(mu/defn delete-osi-ai-contexts! :- :int
  "Delete every OsiAiContext matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/OsiAiContext (->args opts)))

;;; --------------------------------- Queries used only by the osi module ---------------------------------

(mu/defn upsert-ai-context!
  "Insert or replace the `:ai_context` of the OsiAiContext of the entity with `entity-type` and `entity-local-id`
  with `ai-context`, returning its `[entity_type entity_local_id]` compound key."
  [entity-type      :- :string
   entity-local-id  :- ms/PositiveInt
   ai-context       :- ::osi.schema/osi-ai-context.ai-context]
  (app-db/update-or-insert! :model/OsiAiContext
                            {:entity_type     entity-type
                             :entity_local_id entity-local-id}
                            (constantly {:ai_context ai-context})))
