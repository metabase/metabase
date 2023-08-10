(ns metabase.lib.join.strategy
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.join.common :as lib.join.common]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.util.malli :as mu]))

(defn- raw-join-strategy->strategy-option [raw-strategy]
  (merge
   {:lib/type :option/join.strategy
    :strategy raw-strategy}
   (when (= raw-strategy :left-join)
     {:default true})))

(mu/defn raw-join-strategy :- ::lib.schema.join/strategy
  "Get the raw keyword strategy (type) of a given join, e.g. `:left-join` or `:right-join`. This is either the value
  of the optional `:strategy` key or the default, `:left-join`, if `:strategy` is not specified."
  [a-join :- lib.join.common/PartialJoin]
  (get a-join :strategy :left-join))

(mu/defn join-strategy :- ::lib.schema.join/strategy.option
  "Get the strategy (type) of a given join, as a `:option/join.strategy` map. If `:stategy` is unspecified, returns
  the default, left join."
  [a-join :- lib.join.common/PartialJoin]
  (raw-join-strategy->strategy-option (raw-join-strategy a-join)))

(mu/defn with-join-strategy :- lib.join.common/PartialJoin
  "Return a copy of `a-join` with its `:strategy` set to `strategy`."
  [a-join   :- lib.join.common/PartialJoin
   strategy :- [:or ::lib.schema.join/strategy ::lib.schema.join/strategy.option]]
  ;; unwrap the strategy to a raw keyword if needed.
  (assoc a-join :strategy (cond-> strategy
                            (= (lib.dispatch/dispatch-value strategy) :option/join.strategy)
                            :strategy)))

(mu/defn available-join-strategies :- [:sequential ::lib.schema.join/strategy.option]
  "Get available join strategies for the current Database (based on the Database's
  supported [[metabase.driver/driver-features]]) as raw keywords like `:left-join`."
  ([query]
   (available-join-strategies query -1))

  ;; stage number is not currently used, but it is taken as a parameter for consistency with the rest of MLv2
  ([query         :- ::lib.schema/query
    _stage-number :- :int]
   (let [database (lib.metadata/database query)
         features (:features database)]
     (into []
           (comp (filter (partial contains? features))
                 (map raw-join-strategy->strategy-option))
           [:left-join :right-join :inner-join :full-join]))))
