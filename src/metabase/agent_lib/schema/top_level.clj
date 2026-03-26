(ns metabase.agent-lib.schema.top-level
  "Top-level operation schema helpers derived from the capability catalog."
  (:require
   [metabase.agent-lib.capabilities.catalog.top-level :as capabilities.top-level]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private schema-ns
  "metabase.agent-lib.schema")

(defn- schema-ref
  [local-name]
  [:ref (keyword schema-ns local-name)])

(def ^:private top-level-operation-schemas
  {"filter"            [:tuple [:= "filter"] (schema-ref "form")]
   "aggregate"         [:tuple [:= "aggregate"] (schema-ref "form")]
   "breakout"          [:tuple [:= "breakout"] (schema-ref "form")]
   "with-fields"       [:tuple [:= "with-fields"] [:sequential (schema-ref "form")]]
   "limit"             [:tuple [:= "limit"] ms/PositiveInt]
   "expression"        [:tuple [:= "expression"] (schema-ref "non-blank-string") (schema-ref "form")]
   "join"              [:tuple [:= "join"] (schema-ref "form")]
   "order-by"          [:or
                        [:tuple [:= "order-by"] (schema-ref "form")]
                        [:tuple [:= "order-by"] (schema-ref "form") [:enum "asc" "desc"]]]
   "append-stage"      [:tuple [:= "append-stage"]]
   "drop-stage"        [:tuple [:= "drop-stage"]]
   "drop-empty-stages" [:tuple [:= "drop-empty-stages"]]
   "with-page"         [:tuple [:= "with-page"] (schema-ref "page")]})

(def ^:private top-level-op-names
  (mapv (comp name :op) capabilities.top-level/capabilities))

(defn- validate-top-level-coverage!
  []
  (let [defined-ops (set (keys top-level-operation-schemas))
        catalog-ops (set top-level-op-names)]
    (when (not= defined-ops catalog-ops)
      (throw (ex-info "Top-level capability and schema definitions are out of sync."
                      {:defined-ops defined-ops
                       :catalog-ops catalog-ops})))))

(validate-top-level-coverage!)

(def ^{:doc "Schema form for all valid top-level structured query transforms, ordered from the top-level capability catalog."}
  query-transform-form
  (into [:or]
        (map top-level-operation-schemas)
        top-level-op-names))
