(ns metabase.agent-lib.capabilities
  "Shared capability registry for the structured MBQL program path."
  (:require
   [metabase.agent-lib.capabilities.catalog :as catalog]
   [metabase.agent-lib.capabilities.derived :as derived]
   [metabase.agent-lib.capabilities.synthetic :as capabilities.synthetic]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def raw-capability-catalog
  "Ordered structured-program capability metadata used for repair, validation, and prompts."
  catalog/raw-capability-catalog)

(def ^:private guidance-keys
  [:prompt-forms
   :prompt-notes
   :shape
   :example
   :retry-shape
   :retry-example
   :retry-notes])

(def ^:private capability-guidance-schema
  [:map {:closed true}
   [:prompt-forms {:optional true} [:sequential :string]]
   [:prompt-notes {:optional true} [:sequential :string]]
   [:shape {:optional true} :string]
   [:example {:optional true} :string]
   [:retry-shape {:optional true} :string]
   [:retry-example {:optional true} :string]
   [:retry-notes {:optional true} [:sequential :string]]])

(def ^:private capability-entry-schema
  [:map {:closed true}
   [:op symbol?]
   [:kind [:enum :top-level :nested]]
   [:binding {:optional true} ifn?]
   [:group {:optional true} keyword?]
   [:arities {:optional true} [:set int?]]
   [:runtime-provided? {:optional true} boolean?]
   [:guidance {:optional true} capability-guidance-schema]])

(defn- split-guidance
  [capability]
  (let [guidance (not-empty (select-keys capability guidance-keys))]
    (cond-> (apply dissoc capability guidance-keys)
      guidance (assoc :guidance guidance))))

(def capability-catalog
  "Ordered structured-program capability metadata keyed into structural fields plus nested guidance."
  (mapv split-guidance raw-capability-catalog))

(defn- validate-capability-catalog!
  []
  (doseq [capability capability-catalog]
    (when-not (mr/validate capability-entry-schema capability)
      (throw (ex-info "Invalid structured capability catalog entry."
                      {:capability capability
                       :schema     capability-entry-schema
                       :explain    (mr/explain capability-entry-schema capability)})))))

(validate-capability-catalog!)

(defn guidance
  "Return prompt and retry guidance metadata for a capability entry."
  [capability]
  (derived/guidance capability))

(defn prompt-forms
  "Return documented prompt forms for a capability entry."
  [capability]
  (derived/prompt-forms capability))

(defn prompt-notes
  "Return documented prompt notes for a capability entry."
  [capability]
  (derived/prompt-notes capability))

(defn guidance-shape
  "Return the documented canonical call shape for a capability entry."
  [capability]
  (derived/guidance-shape capability))

(defn guidance-example
  "Return the documented example program fragment for a capability entry."
  [capability]
  (derived/guidance-example capability))

(def capability-by-op
  "Capability metadata keyed by operator symbol."
  (derived/capability-by-op capability-catalog))

(def fixed-arities
  "Structured helper arities keyed by operator symbol."
  (derived/fixed-arities capability-catalog))

(def trusted-helper-bindings
  "Trusted helper implementations keyed by operator symbol."
  (derived/trusted-helper-bindings capability-catalog))

(def query-transform-symbols
  "Top-level structured query-transform operator symbols."
  (derived/query-transform-symbols capability-catalog))

(def helper-symbols
  "All structured helper symbols accepted by the evaluator."
  (derived/helper-symbols capability-catalog capabilities.synthetic/synthetic-helper-symbols))

(def nested-operator-values
  "String names for nested structured helper operators."
  (derived/nested-operator-values capability-catalog))

(def top-level-operator-values
  "String names for top-level structured operations."
  (derived/top-level-operator-values capability-catalog))

(def operator-guidance-catalog
  "Retry guidance keyed by canonical operator name."
  (derived/operator-guidance-catalog capability-catalog))
