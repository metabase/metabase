(ns metabase.transforms-base.schema
  "Malli schemas for base transform execution.

   These are the minimal schemas needed for execute-base! and its implementations.
   The full transforms module (metabase.transforms.schema) extends these with
   additional fields like :id (required for scheduled execution)."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)
   (clojure.lang Atom)))

;;; ------------------------------------------------- Primitives -------------------------------------------------

(mr/def ::atom
  (ms/InstanceOfClass Atom))

(mr/def ::chan
  (ms/InstanceOfClass ManyToManyChannel))

;;; ------------------------------------------------- Transform -------------------------------------------------

(mr/def ::transform-target
  "Target specification for a transform. Must include at least :type and :name."
  [:map
   [:type :string]
   [:database {:optional true} :int]
   [:schema {:optional true} [:maybe :string]]
   [:name :string]])

(mr/def ::transform
  "A transform map as expected by execute-base! implementations."
  [:map
   ;; The :id is only present for Global transforms, and missing for Workspace transforms.
   [:id {:optional true} pos-int?]
   [:source [:map [:type [:or :string :keyword]]]]
   [:target ::transform-target]
   [:name {:optional true} :string]
   [:description {:optional true} [:maybe :string]]])

;;; ----------------------------------------- Source Range Params -----------------------------------------------

(mr/def ::checkpoint-bound
  "A bound (lo or hi) for incremental checkpoint filtering."
  [:map
   [:value :any]])

(mr/def ::source-range-params
  "Parameters for incremental range filtering on a source query.
   Returned by get-source-range-params."
  [:map
   [:column ::lib.schema.metadata/column]
   [:checkpoint-filter-field-id ::lib.schema.id/field]
   [:lo {:optional true} [:maybe ::checkpoint-bound]]
   [:hi {:optional true} [:maybe ::checkpoint-bound]]])

;;; ------------------------------------------------- Options -------------------------------------------------

(mr/def ::table-remapping
  "Resolved remap for a transform's target. When present, run-query-transform!
   writes to this schema/table instead of the transform's declared target."
  [:map
   [:schema :string]
   [:name   :string]])

(mr/def ::execute-base-options
  "Options map for execute-base! and its implementations."
  [:map
   [:cancelled? {:optional true} ifn?]
   [:run-id {:optional true} [:maybe pos-int?]]
   [:with-stage-timing-fn {:optional true} ifn?]
   [:publish-events? {:optional true} :boolean]
   [:message-log {:optional true} [:maybe ::atom]]
   [:cancel-chan {:optional true} [:maybe ::chan]]
   [:source-range-params {:optional true} [:maybe ::source-range-params]]
   [:table-remapping {:optional true} [:maybe ::table-remapping]]])

;;; ------------------------------------------------- Result -------------------------------------------------

(mr/def ::execute-base-result
  "Result map returned by execute-base!."
  [:map
   [:status [:enum :succeeded :failed :cancelled :timeout]]
   [:result {:optional true} :any]
   [:error {:optional true} [:maybe (ms/InstanceOfClass Throwable)]]
   [:logs {:optional true} [:maybe :string]]
   [:source-range-params {:optional true} [:maybe ::source-range-params]]])
