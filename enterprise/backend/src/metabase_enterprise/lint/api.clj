(ns metabase-enterprise.lint.api
  "`/api/ee/lint`: the instance's content checked against the lint rules, as a report an agent or a CI step can act on.
  The rules are the errors the dependency analysis records; the report is built from the stored findings once the
  analysis is current."
  (:require
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::severity
  [:enum :error :warning])

(mr/def ::rule
  [:map {:closed true}
   [:severity    ::severity]
   [:description :string]])

;; `validation-exception-error` is a warning: the analysis threw rather than found something wrong with the query,
;; so it must not fail a CI run on its own.
(def ^:private rules
  "One rule per analysis error type."
  {:missing-column             {:severity    :error
                                :description "A query reads a column its source does not have."}
   :missing-table-alias        {:severity    :error
                                :description "Native SQL reads a table no known table matches."}
   :missing-table              {:severity    :error
                                :description "A query reads a table that no longer exists."}
   :missing-card               {:severity    :error
                                :description "A query reads a saved question that no longer exists."}
   :duplicate-column           {:severity    :error
                                :description "A query returns two columns with the same name."}
   :syntax-error               {:severity    :error
                                :description "Native SQL does not parse."}
   :validation-exception-error {:severity    :warning
                                :description "The analysis of the query failed."}})

(mr/def ::cause
  "The entity an error is traced to. `entity_id` is null for a table, which has none, and `name` is null when the
  entity no longer exists."
  [:map {:closed true}
   [:type      ::lib.schema.validate/source-entity-type]
   [:id        ms/PositiveInt]
   [:entity_id [:maybe :string]]
   [:name      [:maybe :string]]])

(mr/def ::result
  "One error, on the entity `entity_id` names in `entities`."
  [:map {:closed true}
   [:ruleId    ::lib.schema.validate/validate-error-type]
   [:entity_id :string]
   [:message   :string]
   [:detail    [:maybe :string]]
   [:cause     [:maybe ::cause]]])

(mr/def ::entity
  "An entity a result names, keyed by its serialization `entity_id`."
  [:map {:closed true}
   [:id   ms/PositiveInt]
   [:type [:enum :card :transform :segment]]
   [:data [:map {:closed true}
           [:name          :string]
           [:collection_id [:maybe ms/PositiveInt]]]]])

(mr/def ::report
  [:map {:closed true}
   [:status   [:enum :passed :failed]]
   [:summary  [:map {:closed true}
               [:errors   nat-int?]
               [:warnings nat-int?]
               [:entities nat-int?]]]
   [:entities [:map-of :string ::entity]]
   [:rules    [:map-of ::lib.schema.validate/validate-error-type ::rule]]
   [:results  [:sequential ::result]]])

(mu/defn- cause-text :- :string
  "How a message names `cause`: by name, or by id when the entity no longer exists."
  [{:keys [type id], entity-name :name} :- ::cause]
  (if entity-name
    (str (name type) " \"" entity-name "\"")
    (str (name type) " " id " (deleted)")))

(mu/defn- message :- :string
  "A sentence for one error, from its type, detail and cause."
  [{:keys [type detail cause]} :- ::deps.findings/error]
  (case type
    :missing-column
    (if cause
      (str "Column " detail " is not on " (cause-text cause))
      (str "Column " detail " is not on any table the query reads"))

    :missing-table-alias
    (str "Native SQL reads " detail ", which no known table matches")

    :missing-table
    (if cause
      (str "The query reads " (cause-text cause) ", which no longer exists")
      "The query reads a table that no longer exists")

    :missing-card
    (if cause
      (str "The query reads " (cause-text cause) ", which no longer exists")
      "The query reads a saved question that no longer exists")

    :duplicate-column
    (str "The query returns column " detail " more than once")

    :syntax-error
    (if detail
      (str "Native SQL does not parse: " detail)
      "Native SQL does not parse")

    :validation-exception-error
    (if detail
      (str "The analysis failed: " detail)
      "The analysis failed")))

(mu/defn- result :- ::result
  "The result for one `error` of `entity`."
  [entity :- ::deps.findings/failed-entity
   error  :- ::deps.findings/error]
  {:ruleId    (:type error)
   :entity_id (:entity_id entity)
   :message   (message error)
   :detail    (:detail error)
   :cause     (:cause error)})

(mu/defn- report :- ::report
  "The lint report of the `failed` entities."
  [failed :- [:sequential ::deps.findings/failed-entity]]
  (let [results  (vec (for [entity failed, error (:errors entity)] (result entity error)))
        used     (select-keys rules (map :ruleId results))
        severity (fn [{:keys [ruleId]}] (get-in rules [ruleId :severity]))
        errors   (count (filter #(= :error (severity %)) results))
        warnings (count (filter #(= :warning (severity %)) results))]
    {:status   (if (pos? errors) :failed :passed)
     :summary  {:errors   errors
                :warnings warnings
                :entities (count failed)}
     :entities (into {}
                     (map (fn [{:keys [entity_id id type collection_id], entity-name :name}]
                            [entity_id {:id   id
                                        :type type
                                        :data {:name entity-name :collection_id collection_id}}]))
                     failed)
     :rules    used
     :results  results}))

(api.macros/defendpoint :get "/" :- ::report
  "The lint report of the instance's content, for superusers: every card, transform and segment whose query analysis
  found an error, with each error as a `result` naming the entity, the rule it breaks and the entity that caused it
  when the analysis traced one. The analysis the background jobs owe is run first, so the report reflects every write
  committed before the request and `passed` means nothing is broken."
  [_route-params _query-params]
  (api/check-superuser)
  (deps.findings/drain-pending!)
  (report (deps.findings/failed-entities)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/lint` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
