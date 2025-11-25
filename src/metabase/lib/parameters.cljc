(ns metabase.lib.parameters
  "TODO (Cam 10/10/25) -- all this code is only necessary because the `:dimension` 'clause' in a parameter/parameter
  mapping `:target` does not use standard MBQL 5 clause syntax. I avoided the change to avoid breaking all the
  existing code that manipulates MBQL 4 by hand. Most of the BE code in question has been ported, except for drivers
  parameter code. The FE code still creates these by hand. One of these days we'll want to go clean all this stuff up.

  See https://metaboat.slack.com/archives/C0645JP1W81/p1760128892249879"
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli :as mu]))

(mu/defn- parameter-target-template-tag :- [:maybe ::lib.schema.parameter/template-tag]
  [target :- ::lib.schema.parameter/target]
  (case (first target)
    :dimension (let [[_tag dimension] target]
                 (case (first dimension)
                   :template-tag dimension
                   nil))
    :variable (let [[_tag variable] target]
                (case (first variable)
                  :template-tag variable
                  nil))
    nil))

(mu/defn parameter-target-template-tag-name :- [:maybe :string]
  "If parameter `:target` is a `:template-tag` psuedo-clause, return the name of the template tag it references."
  [target :- ::lib.schema.parameter/target]
  (when-let [[_tag tag-name] (parameter-target-template-tag target)]
    (cond
      (string? tag-name) tag-name
      (map? tag-name)    (:id tag-name))))

(mu/defn- parameter-target-legacy-field-ref :- [:maybe ::lib.schema.parameter/target.legacy-field-ref]
  [target :- ::lib.schema.parameter/target]
  (case (first target)
    :dimension (let [[_tag dimension] target]
                 (case (first dimension)
                   :field dimension
                   nil))
    :variable  (let [[_tag variable] target]
                 (case (first variable)
                   :field variable
                   nil))
    :field     target
    nil))

(mu/defn parameter-target-field-ref :- [:maybe :mbql.clause/field]
  "If a parameter `:target` wraps a legacy `:field` ref, find it, convert it to MBQL 5, and return it."
  [target :- ::lib.schema.parameter/target]
  (some-> target parameter-target-legacy-field-ref lib.convert/->pMBQL))

(mu/defn parameter-target-field-id :- [:maybe ::lib.schema.id/field]
  "If a parameter `:target` wraps a field ID ref return the Field ID."
  [target :- ::lib.schema.parameter/target]
  (some-> target parameter-target-field-ref lib.ref/field-ref-id))

(mu/defn parameter-target-field-name :- [:maybe :string]
  "If a parameter `:target` wraps a field name ref return the Field ID."
  [target :- ::lib.schema.parameter/target]
  (some-> target parameter-target-field-ref lib.ref/field-ref-name))

(mu/defn parameter-target-field-options :- [:maybe ::lib.schema.ref/field.options]
  "If a parameter `:target` wraps a `:field` ref return the ref options map."
  [target :- ::lib.schema.parameter/target]
  (some-> target parameter-target-field-ref lib.options/options))

(mu/defn- parameter-target-legacy-expression-ref :- [:maybe ::lib.schema.parameter/target.legacy-expression-ref]
  [target :- ::lib.schema.parameter/target]
  (case (first target)
    :dimension (let [[_tag dimension] target]
                 (case (first dimension)
                   :expression dimension
                   nil))
    nil))

(mu/defn parameter-target-expression-ref :- [:maybe :mbql.clause/expression]
  "If a parameter `:target` wraps a legacy `:expression` ref, find it, convert it to MBQL 5, and return it."
  [target :- ::lib.schema.parameter/target]
  (some-> target parameter-target-legacy-expression-ref lib.convert/->pMBQL))

(mu/defn parameter-target-expression-name :- [:maybe :string]
  "If a parameter `:target` wraps an `:expression` ref return the expression name."
  [target :- ::lib.schema.parameter/target]
  (some-> target parameter-target-expression-ref lib.ref/expression-ref-name))

(mu/defn parameter-target-expression-options :- [:maybe ::lib.schema.ref/expression.options]
  "If a parameter `:target` wraps an `:expression` ref return the ref options map."
  [target :- ::lib.schema.parameter/target]
  (some-> target parameter-target-expression-ref lib.options/options))

(mu/defn parameter-target-is-dimension?
  "Whether a parameter `:target` is a `:dimension` psuedo-clause. (Generally, you don't want to check this because it's
  pretty meaningless) -- see thread https://metaboat.slack.com/archives/C0645JP1W81/p1760128892249879 for more
  details."
  [target :- ::lib.schema.parameter/target]
  (case (first target)
    :dimension true
    false))

(mu/defn parameter-target-dimension-options :- [:maybe ::lib.schema.parameter/dimension.options]
  "If parameter `:target` is a `:dimension` pseudo-clause, return the options map associated with it, if any."
  [target :- ::lib.schema.parameter/target]
  (case (first target)
    :dimension (let [[_tag _dimension opts] target]
                 opts)
    nil))

(mu/defn update-parameter-target-dimension-options :- ::lib.schema.parameter/target
  "If parameter `:target` is a `:dimension` pseudo-clause, update the options map associated with it, if any. If it is
  not a `:dimension` psuedo-clause, this function no-ops."
  [target :- ::lib.schema.parameter/target
   f & args]
  (case (first target)
    :dimension (let [[_tag dimension opts] target]
                 [:dimension dimension (apply f opts args)])
    target))
