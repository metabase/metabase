(ns metabase.lib.drill-thru.common
  (:require
   [metabase.lib.card :as lib.card]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defn mbql-stage?
  "Is this query stage an MBQL stage?"
  [query stage-number]
  (-> (lib.util/query-stage query stage-number)
      :lib/type
      (= :mbql.stage/mbql)))

(defn- drill-thru-dispatch [_query _stage-number drill-thru & _args]
  (:type drill-thru))

(defmulti drill-thru-method
  "e.g.

    (drill-thru-method query stage-number drill-thru)`

  Applies the `drill-thru` to the query and stage. Keyed on the `:type` of the drill-thru.
  Returns the updated query."
  {:arglists '([query stage-number drill-thru & args])}
  drill-thru-dispatch
  :hierarchy lib.hierarchy/hierarchy)

(defmulti drill-thru-info-method
  "Helper for getting the display-info of each specific type of drill-thru."
  {:arglists '([query stage-number drill-thru])}
  drill-thru-dispatch
  :hierarchy lib.hierarchy/hierarchy)

(defmethod drill-thru-info-method :default
  [_query _stage-number drill-thru]
  ;; Several drill-thrus are rendered as a fixed label for that type, with no reference to the column or value,
  ;; so the default is simply the drill-thru type.
  (select-keys drill-thru [:type :display-name]))

(mu/defn primary-keys :- [:sequential ::lib.schema.metadata/column]
  "Returns a list of primary keys for the source table or card of this query."
  [query :- ::lib.schema/query]
  (let [fields (or (when-let [table-id (lib.util/source-table-id query)]
                     (lib.metadata/fields query table-id))
                   (when-let [card-id (lib.util/source-card-id query)]
                     (lib.card/saved-question-metadata query card-id))
                   [])]
    (into [] (filter lib.types.isa/primary-key?) fields)))

(mu/defn many-pks?
  "Does the source table or card for this `query` have more than one primary key?"
  [query :- ::lib.schema/query]
  (> (count (primary-keys query)) 1))

(defn drill-value->js
  "Convert a drill value to a JS value"
  [value]
  (if (= value :null) nil value))
