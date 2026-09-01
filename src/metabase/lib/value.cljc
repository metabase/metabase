(ns metabase.lib.value
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.util.malli :as mu]))

(mu/defn value :- :mbql.clause/value
  "Generate a new `:value` clause, used to wrap wrap value literals to allow type information to be attached to them.
  Mostly used by the query processor.

  Note that `:effective-type` is required in `opts`."
  [opts :- [:maybe [:merge
                    [:ref ::lib.schema.literal/value.options]
                    ;; `:lib/uuid` is optional, as it will be added automatically
                    [:map
                     [:lib/uuid {:optional true} ::lib.schema.common/uuid]]]]
   v]
  [:value (assoc opts :lib/uuid (str (random-uuid))) v])
