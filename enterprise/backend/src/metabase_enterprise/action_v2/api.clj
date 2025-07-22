(ns metabase-enterprise.action-v2.api
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.action-v2.data-editing :as data-editing]
   [metabase-enterprise.action-v2.describe :as data-editing.describe]
   [metabase.actions.core :as actions]
   [metabase.actions.types :as types]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; might later be changed, or made driver specific, we might later drop the requirement depending on admin trust
;; model (e.g are admins trusted with writing arbitrary SQL cases anyway, will non admins ever call this?)
(def ^:private Identifier
  "A malli schema for strings that can be used as SQL identifiers"
  [:re #"^[\w\- ]+$"])

;; upload types are used temporarily, I expect this to change
(def ^:private column-type->upload-type
  {"auto_incrementing_int_pk" :metabase.upload/auto-incrementing-int-pk
   "boolean"                  :metabase.upload/boolean
   "int"                      :metabase.upload/int
   "float"                    :metabase.upload/float
   "varchar255"               :metabase.upload/varchar-255
   "text"                     :metabase.upload/text
   "date"                     :metabase.upload/date
   "datetime"                 :metabase.upload/datetime
   "offset_datetime"          :metabase.upload/timestamp-with-time-zone})

(def ^:private ColumnType
  (into [:enum] (keys column-type->upload-type)))

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

;; TODO Regret this name, let's rename it to something like ::action-expression once it's pure data.
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
  [{:keys [dashcard-id param-map] :as _action} input params]
  ;; TODO don't fetch the row-data from the db if we only need columns that we already have, i.e. they are in the pk
  (let [row (delay (let [{:keys [table_id]} (actions/cached-value
                                             [:dashcard-viz dashcard-id]
                                             #(t2/select-one-fn :visualization_settings :model/DashboardCard dashcard-id))]
                     (if-not table_id
                       ;; this is not an Editable, it must be a question - so we use the client-side row
                       (update-keys input name)
                       ;; TODO batch fetching all these rows, across all inputs
                       (let [fields    (t2/select [:model/Field :id :name :semantic_type] :table_id table_id)
                             pk-fields (filter #(= :type/PK (:semantic_type %)) fields)
                             ;; TODO we could restrict which fields we fetch in future
                             [row]     (data-editing/query-db-rows table_id pk-fields [input])
                             _         (api/check-404 row)]
                         ;; TODO it would be more robust to use field-ids instead of names in the configuration
                         (update-keys row name)))))]
    (if-not param-map
      (merge input params)
      (reduce-kv
       (fn [acc k v]
         (let [override (when-not (:visible v) (get params k))]
           (case (:sourceType v)
             ;; I don't think the FE can send a value for ask-user, but our tests do it...
             "ask-user" (assoc acc k (if (contains? params k) override (:value v)))
             "constant" (assoc acc k (or override (:value v)))
             ;; Hack for getting partially mapped data for /configure
             "row-data" (if-not (seq input)
                          acc
                          (assoc acc k (or override (get @row (:sourceValueTarget v)))))
             ;; no mapping? omit the key
             nil acc)))
       {}
       param-map))))

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
             ;; TODO handle the fact this stuff can be json-ified better
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
  "TODO: docstring"
  [{}
   {}
   {:keys [action scope params input]}
   :- [:map
       [:action ::api-action-id-or-expression]
       [:scope ::types/scope.raw]
       [:params {:optional true} :map]
       [:input :map]]]
  {:outputs (execute!* action scope params [input])})

(api.macros/defendpoint :post "/execute-bulk"
  "TODO: docstring"
  [{}
   {}
   {:keys [action scope inputs params]}
   :- [:map
       [:action ::api-action-id-or-expression]
       [:scope ::types/scope.raw]
       [:inputs [:sequential :map]]
       [:params {:optional true} [:map-of :keyword :any]]]]
  {:outputs (execute!* action scope params inputs)})

(defn- row-data-mapping
  ;; TODO get this working with arbitrary nesting of inner actions
  "HACK: create a placeholder unified action who will map to the values we need from row-data, if we need any"
  [{:keys [param-map] :as action}]
  ;; We create a version of the action that will "map" to an input which is just the row data itself.
  (let [row-data-mapping (u/for-map [[_ {:keys [sourceType sourceValueTarget]}] param-map
                                     :when (= "row-data" sourceType)]
                           [sourceValueTarget [::key (keyword sourceValueTarget)]])]
    (when (seq row-data-mapping)
      {:inner-action {:action-kw :placeholder}
       :dashcard-id  (:dashcard-id action)
       :param-map    (u/for-map [[_ {:keys [sourceType sourceValueTarget] :as param-setting}] param-map
                                 :when (= "row-data" sourceType)]
                       [(keyword sourceValueTarget) param-setting])
       :mapping      row-data-mapping})))

(defn- get-row-data
  "For a row or header action, fetch underlying database values that'll be used for specific action params in mapping."
  [action input]
  ;; it would be nice to avoid using "apply-mapping" twice (once here on this stub action, once later on the real one)
  (some-> (row-data-mapping action)
          (apply-mapping-nested nil [input])
          first
          not-empty))

(api.macros/defendpoint :post "/execute-form"
  "Temporary endpoint for describing an actions parameters
  such that they can be presented correctly in a modal ahead of execution."
  [{}
   {}
   ;; TODO support for bulk actions
   {:keys [action scope input]}]
  (let [scope         (actions/hydrate-scope scope)
        unified       (fetch-unified-action scope action)
        row-data      (get-row-data unified input)
        partial-input (first (apply-mapping-nested unified nil [input]))]
    (data-editing.describe/describe-unified-action unified scope row-data partial-input)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/action-v2 routes."
  (api.macros/ns-handler *ns* +auth))
