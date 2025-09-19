(ns metabase-enterprise.representations.api
  (:require
   [clojure.pprint :refer [pprint]]
   [metabase-enterprise.representations.core :as rep]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections.api :as coll.api]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/load/:collection-id"
  "Create a new thingy inside of a collection."
  [{:keys [collection-id]}
   _query-params
   _body-params
   request]
  (try
    (let [collection-id (Long/parseLong collection-id)]
      (-> (slurp (:body request))
          yaml/parse-string
          (assoc :collection collection-id)
          rep/yaml->toucan
          rep/persist!)
      nil)
    (catch Throwable e
      (log/error e)
      (throw e))))

(defn- source-table-ref [table]
  (cond
    (vector? table)
    (let [[db schema table] table]
      {:database db
       :schema   schema
       :table    table})

    (string? table)
    (let [referred-card (t2/select-one :model/Card :entity_id table)]
      {:type (:type referred-card)
       :ref (rep/card-ref referred-card)})))

(defn- update-source-table [card]
  (if-some [table (get-in card [:mbql_query :source-table])]
    (update-in card [:mbql_query :source-table] source-table-ref)
    card))

(defn- patch-card-refs [card]
  (println "patching")
  (-> card
      (update-source-table)))

(api.macros/defendpoint :get "/question/:id"
  "Download a yaml representation of a question."
  [{:keys [id]} :- :any
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Card :id id :type "question"))
        rep (rep/export-card "question" question)
        rep (patch-card-refs rep)]
    (try
      (rep/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep)))

(api.macros/defendpoint :get "/model/:id"
  "Download a yaml representation of a model."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Card :id id :type "model"))
        rep (rep/export-card "model" question)]
    (try
      (rep/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep)))

(api.macros/defendpoint :get "/card/:id"
  "Download a yaml representation of a card."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        question (api/check-404 (t2/select-one :model/Card :id id))
        rep (rep/export-card (:type question) question)]
    (try
      (rep/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (yaml/generate-string rep)))

(defn- model->url [model]
  (let [modelname (get {:dataset :model
                        :card :question}
                       (keyword (:model model)) (:model model))]
    (format "/api/ee/representation/%s/%s" (name modelname) (:id model))))

(api.macros/defendpoint :get "/collection/:id"
  "Download a yaml representation of a collection."
  [{:keys [id]}
   _query-params
   _body-params
   _request]
  (let [id (Long/parseLong id)
        collection (api/check-404 (t2/select-one :model/Collection :id id))
        rep (rep/export-collection collection)
        children (coll.api/collection-children collection {:show-dashboard-questions? true
                                                           :archived? false})]
    (try
      (rep/validate rep)
      (catch Exception e
        (log/error e "Does not validate.")))
    (let [rep (assoc rep :children (mapv model->url (:data children)))]
      (yaml/generate-string rep))))

(comment
  (binding [api/*current-user-id* 1]
    (coll.api/collection-children (t2/select-one :model/Collection :id 5)
                                  {:show-dashboard-questions? true
                                   :archived? false})))

(api.macros/defendpoint :post "/validate"
  "Validate a YAML representation string and return validation errors if any.
   Returns an empty string if validation succeeds, or the ex-data as a string if it fails."
  [_path-params
   _query-params
   _body-params
   request]
  (try
    (let [yaml-string (slurp (:body request))
          representation (yaml/parse-string yaml-string)]
      (rep/validate representation)
      "")                               ; Return empty string on success
    (catch Exception e
      (with-out-str
        (println (ex-message e))
        (pprint (ex-data e))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/representations` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
