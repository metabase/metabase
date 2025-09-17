(ns metabase-enterprise.action-v2.api
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.action-v2.execute-form :as data-editing.execute-form]
   [metabase.actions.core :as actions]
   [metabase.actions.types :as types]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;; might later be changed, or made driver specific, we might later drop the requirement depending on admin trust
;; model (e.g are admins trusted with writing arbitrary SQL cases anyway, will non admins ever call this?)
;; upload types are used temporarily, I expect this to change
(mr/def ::api-action-id
  "Primitive actions, saved actions, and packed encodings from the picker."
  [:or
   ;; :model/Action id - these are for legacy Model Actions.
   ms/PositiveInt
   ;; primitive action
   :string])

(mr/def ::api-action-expression
  "A more relaxed version of ::action-expression that can still have opaque identifiers inside inside."
  :map)

(mr/def ::api-action-id-or-expression
  "All the various ways of referring to an action with the v2 APIs."
  [:or ::api-action-id ::api-action-expression])

(mr/def ::action-expression
  "The internal representation used by our APIs, after we've parsed the relevant ids and fetched their configuration."
  ;; Expected extensions:
  ;; - data app actions (with their mappings)
  ;; - action expressions (e.g., unsaved data app actions. might not need these with auto save)
  ;; - dashboard buttons (unless we deprecate them instead)
  [:or
   [:map {:closed true}
    [:model-action-id ms/PositiveInt]]
   [:map {:closed true}
    [:action-kw :keyword]
    [:mapping [:maybe :map]]]])

(mu/defn- fetch-unified-action :- ::action-expression
  "Resolve various flavors of action-id into plain data, making it easier to dispatch on. Fetch config etc."
  [scope :- ::types/scope.hydrated
   raw   :- ::api-action-id-or-expression]
  (cond
    (map? raw)     (throw (ex-info "We do not currently support action expressions." {:status-code 400, :expression raw}))
    ;; TODO ideally this would fetch the configuration as well, but using an opaque id makes it easier to reuse legacy code
    (pos-int? raw) {:model-action-id raw}
    (string? raw)  (let [kw (keyword raw)]
                     {:action-kw kw
                      :mapping   (actions/default-mapping kw scope)})
    :else
    (throw (ex-info "Unexpected id value" {:status-code 400, :action raw}))))

(defn- hydrate-mapping [mapping]
  (walk/postwalk-replace
   {"::root"   ::root
    "::key"    ::key
    "::input"  ::input
    "::params" ::params
    "::param"  ::param}
   mapping))

(defn- augment-params
  [{:keys [param-map] :as _action} input params]
  (if-not param-map
    (merge input params)
    (reduce-kv
     (fn [acc k v]
       (let [override (when-not (:visible v) (get params k))]
         (case (:sourceType v)
           ;; It seems like misconfiguration to configure a default :value for "ask-user", but some tests do it.
           "ask-user" (assoc acc k (if (contains? params k) override (:value v)))
           "constant" (assoc acc k (or override (:value v)))
           "row-data" (throw (ex-info "Row data mappings are not yet supported" {:status-code 501}))
           ;; no mapping? omit the key
           nil acc)))
     {}
     param-map)))

(defn- apply-mapping [{:keys [mapping] :as action} params inputs]
  (let [mapping (hydrate-mapping mapping)
        tag?    #(and (vector? %2) (= %1 (first %2)))]
    (if-not mapping
      (if (or params (:param-map action))
        (map #(augment-params action % params) inputs)
        inputs)
      (for [input inputs
            :let [root (augment-params action input params)]]
        (walk/postwalk
         (fn [x]
           (cond
             (= ::root x)   root
             (= ::input x)  input
             (= ::params x) params
             ;; specific key
             (tag? ::key x)   (get root (keyword (second x)))
             (tag? ::param x) (get params (keyword (second x)))
             :else
             x))
         mapping)))))

(defn- apply-mapping-nested [{:keys [inner-action] :as outer-action} params inputs-before]
  (let [inputs-after (apply-mapping outer-action params inputs-before)]
    (if inner-action
      (recur inner-action nil inputs-after)
      inputs-after)))

(defn- execute!* [action-id scope params raw-inputs]
  (let [scope      (actions/hydrate-scope scope)
        action-def (fetch-unified-action scope action-id)
        inputs     (apply-mapping-nested action-def params raw-inputs)]
    (cond
      (:model-action-id action-def)
      (throw (ex-info "We do not currently support execution of Model Actions" {:status-code 400}))
      (:action-kw action-def)
      (let [action-kw (keyword (:action-kw action-def))]
        (:outputs (actions/perform-action-v2! action-kw scope inputs)))
      :else
      (throw (ex-info "Not able to execute given action yet" {:status-code 400 :scope scope :action action-def})))))

(api.macros/defendpoint :post "/execute"
  "Execute an action with a single input.

   Takes:
   - `action`            - an identifier or an expression for what we want to execute.
   - `scope`             - where the action is being invoked from.
   - `input`             - a single map. currently these are typically a database table row pk, or query result.
   - `params` (optional) - a map of values for the parameters taken by the action's mapping.

   The `input` and `params` are used by the relevant mapping to calculate a map argument to the underlying action fn.
   If there is no mapping, `params` are simply used as overrides for `input`.

   Returns the outputs from the performed action."
  [{}
   {}
   {:keys [action scope params input]}
   :- [:map
       [:action ::api-action-id-or-expression]
       [:scope ::types/scope.raw]
       [:params {:optional true} :map]
       [:input {:optional true} :map]]]
  ;; This check should be redundant in practice with the permission checks within perform-action!
  ;; Since test coverage is light and the logic is so simple, we've decided to be extra cautious for now.
  (api/check-superuser)
  {:outputs (execute!* action scope params [input])})

(api.macros/defendpoint :post "/execute-bulk"
  "Execute an action with multiple inputs.

   This is typically more efficient than calling execute with each input individually, for example by performing batch
   SQL operations.

   Takes:
   - `action`            - an identifier or an expression for what we want to execute.
   - `scope`             - where the action is being invoked from.
   - `inputs`            - a list of maps. currently these are typically a database table row pk, or query result.
   - `params` (optional) - a map of values for the parameters taken by the action's mapping.

   The `inputs` and `params` are used by the relevant mapping to calculate a list of args for the underlying action fn.
   If there is no mapping, `params` are simply used as overrides for each map within `inputs`.

   Returns the outputs from the performed action."
  [{}
   {}
   {:keys [action scope inputs params]}
   :- [:map
       [:action ::api-action-id-or-expression]
       [:scope ::types/scope.raw]
       [:inputs [:sequential {:min 1} :map]]
       [:params {:optional true} [:map-of :keyword :any]]]]
  ;; This check should be redundant in practice with the permission checks within perform-action!
  ;; Since test coverage is light and the logic is so simple, we've decided to be extra cautious for now.
  (api/check-superuser)
  {:outputs (execute!* action scope params inputs)})

(api.macros/defendpoint :post "/execute-form"
  "Temporary endpoint for describing an actions parameters
  such that they can be presented correctly in a modal ahead of execution."
  [{}
   {}
   ;; TODO support for bulk actions
   {:keys [action scope input]}]
  :- :metabase-enterprise.action-v2.execute-form/action-description
  ;; This check should be redundant in practice with the permission checks within perform-action!
  ;; Since test coverage is light and the logic is so simple, we've decided to be extra cautious for now.
  (api/check-superuser)
  (let [scope         (actions/hydrate-scope scope)
        unified       (fetch-unified-action scope action)
        partial-input (first (apply-mapping-nested unified nil [input]))]
    (data-editing.execute-form/describe-form unified scope partial-input)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/action-v2 routes."
  (api.macros/ns-handler *ns* +auth))
