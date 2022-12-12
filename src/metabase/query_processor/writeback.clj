(ns metabase.query-processor.writeback
  "Code for executing writeback queries."
  (:require
   [clojure.tools.logging :as log]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.parameters :as parameters]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.schema :as su]
   [schema.core :as s]))

(defn- map-parameters
  "Take the `parameters` map passed in to an endpoint like `POST /api/emitter/:id/execute` and map it to the parameters
  in the underlying `Action` so they can be attached to the query that gets passed to [[qp/execute-write-query!]].

  Incoming API request `:parameters` should look like

    {:parameters {\"my_id\" {:type  :number/=
                             :value 10}}}

  And `parameter_mappings` should look like

     {:my_id [:template-tag \"id\"]}

  We need to convert these to a list like

    [{:target [:template-tag \"id\"]
      :value  10}]

  before passing to the QP code."
  [parameters parameter-mappings]
  (mapv (fn [[param-id param-value-info]]
          (let [target (or (get parameter-mappings param-id)
                           (throw (ex-info (tru "No parameter mapping found for parameter {0}. Found: {1}"
                                                (pr-str param-id)
                                                (pr-str (set (keys parameter-mappings))))
                                           {:status-code 400
                                            :type        qp.error-type/invalid-parameter
                                            :parameters  parameters
                                            :mappings    parameter-mappings})))]
            (merge {:id     param-id
                    :target target}
                   param-value-info)))
        parameters))

(defn- apply-middleware [qp middleware-fns]
  (reduce
   (fn [qp middleware]
     (if middleware
       (middleware qp)
       qp))
   qp
   middleware-fns))

(defn- writeback-qp []
  ;; `rff` and `context` are not currently used by the writeback QP stuff, so these parameters can be ignored; we pass
  ;; in `nil` for these below.
  (letfn [(qp* [query _rff _context]
            (let [query (parameters/substitute-parameters query)]
              ;; ok, now execute the query.
              (log/debugf "Executing query\n\n%s" (u/pprint-to-str query))
              (driver/execute-write-query! driver/*driver* query)))]
    (apply-middleware qp* qp/around-middleware)))

(defn execute-write-query!
  "Execute an writeback query from an `is_write` SavedQuestion."
  [{query-type :type, :as query}]
  ;; make sure this is a native query.
  (when-not (= query-type :native)
    (throw (ex-info (tru "Only native queries can be executed as write queries.")
                    {:type qp.error-type/invalid-query, :status-code 400, :query query})))
  ((writeback-qp) query nil nil))

(def ^:private HydratedQueryEmitter
  {:id       su/IntGreaterThanZero
   :action   {:card     {:dataset_query su/Map
                         :is_write      s/Bool
                         s/Keyword      s/Any}
              s/Keyword s/Any}
   s/Keyword s/Any})

(s/defn execute-query-emitter!
  "Execute a `QueryEmitter` with parameters as passed in to the `POST /api/emitter/:id/execute`
  endpoint (see [[map-parameters]] for a description of their shape). `emitter` should already be hydrated with its `:action`
  and the Action's `:card`."
  [{{:keys [card]} :action, emitter-id :id, :as emitter} :- HydratedQueryEmitter
   parameters]
  (when-not card
    (throw (ex-info (tru "No Query Action found for Emitter {0}. Only Query Actions are supported at this point in time."
                         emitter-id)
                    {:status-code 400, :emitter emitter})))
  (when-not (:is_write card)
    (throw (ex-info (tru "Cannot execute emitter {0}: Card {1} is not marked as `is_write`"
                         emitter-id
                         (:id card))
                    {:status-code 400, :emitter emitter})))
  (log/tracef "Executing emitter\n\n%s" (u/pprint-to-str emitter))
  (try
    (log/tracef "Mapping parameters\n\n%s\nwith mappings\n\n%s"
                (u/pprint-to-str parameters)
                (u/pprint-to-str (:parameter_mappings emitter)))
    (let [parameters (map-parameters parameters (:parameter_mappings emitter))
          query      (assoc (:dataset_query card) :parameters parameters)]
      (log/debugf "Query (before preprocessing):\n\n%s" (u/pprint-to-str query))
      (execute-write-query! query))
    (catch Throwable e
      (throw (ex-info (tru "Error executing QueryEmitter: {0}" (ex-message e))
                      {:emitter    emitter
                       :parameters parameters}
                      e)))))
