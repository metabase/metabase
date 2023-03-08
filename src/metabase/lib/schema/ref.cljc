(ns metabase.lib.schema.ref
  "Malli schema for a Field, aggregation, or expression reference (etc.)"
  (:require
   [clojure.test.check.generators :as gen]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(mr/def ::field.options
  [:merge
   ::common/options
   [:map
    ;; this schema is delaying the type check so that we are less dependant on the order namespaces are loaded
    [:base-type {:optional true} [:fn {:gen/gen (gen/elements (descendants :type/*))} #(isa? % :type/*)]]
    [:temporal-unit {:optional true} ::temporal-bucketing/unit]]])

;;; `:field` clause
(mr/def ::field
  [:and
   [:vcatn
    [:clause [:= :field]]
    [:id-or-name [:altn
                  [:id ::id/field]
                  [:name ::common/non-blank-string]]]
    [:options ::field.options]]
   [:fn (fn [[_field id-or-name options]]
          (or (integer? id-or-name)
              (and (string? id-or-name)
                   (isa? (:base-type options) :type/*))))]])

;; this is a placeholder that will be resolved later once we have metadata and `append` it to the query. Used to
;; implement [[metabase.lib.field/field]] so you don't have to pass metadata to it directly.
(mr/def ::field.unresolved
  [:vcatn
   [:clause [:= :field/unresolved]]
   [:info :map]])

(mr/def ::expression
  [:vcatn
   [:clause [:= :expression]]
   [:name ::common/non-blank-string]])

(mr/def ::aggregation
  [:vcatn
   [:clause [:= :aggregation]]
   [:index ::common/int-greater-than-or-equal-to-zero]])

(mr/def ::ref
  [:or
   ::field.unresolved
   ::field
   ::aggregation
   ::expression])
