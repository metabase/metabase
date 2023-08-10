(ns metabase.lib.join.fields
  (:require
   [metabase.lib.join.alias :as lib.join.alias]
   [metabase.lib.join.common :as lib.join.common]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn join-fields :- [:maybe ::lib.schema.join/fields]
  "Get all join conditions for the given join"
  [a-join :- lib.join.common/PartialJoin]
  (:fields a-join))

(mu/defn with-join-fields :- lib.join.common/PartialJoin
  "Update a join (or a function that will return a join) to include `:fields`, either `:all`, `:none`, or a sequence of
  references."
  [joinable :- lib.join.common/PartialJoin
   fields   :- [:maybe [:or [:enum :all :none] [:sequential some?]]]]
  (let [fields (cond
                 (keyword? fields) fields
                 (= fields [])     :none
                 :else             (not-empty
                                    (into []
                                          (comp (map lib.ref/ref)
                                                (if-let [current-alias (lib.join.alias/current-join-alias joinable)]
                                                  (map #(lib.join.alias/with-join-alias % current-alias))
                                                  identity))
                                          fields)))]
    (u/assoc-dissoc joinable :fields fields)))
