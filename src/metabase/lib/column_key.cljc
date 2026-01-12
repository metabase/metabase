(ns metabase.lib.column-key
  "Helpers for constructing the [[lib.schema.column-key/column-key]] for various kinds of entities."
  (:require
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.column-key :as lib.schema.column-key]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

(mu/defn field-key :- ::lib.schema.column-key/column-key
  "Returns the column key for a plain database field, given its ID.

  (If you don't have an ID, you need a different kind of column key.)"
  [field-id :- ::lib.schema.id/field]
  {:lib/type        :column/key
   :column.field/id field-id})

(defn- join-uuid [join-clause-or-uuid]
  (if (string? join-clause-or-uuid)
    join-clause-or-uuid
    (lib.options/uuid join-clause-or-uuid)))

(mu/defn explicitly-joined :- ::lib.schema.column-key/column-key
  "Constructs the column key for an explicitly joined column, given either the explicit join clause or its UUID,
  and the column's key inside the join's RHS."
  [inner-column-key    :- ::lib.schema.column-key/column-key
   join-clause-or-uuid :- [:or ::lib.schema.join/join ::lib.schema.common/uuid]]
  {:lib/type                   :column/key
   :column.joined/join-uuid    (join-uuid join-clause-or-uuid)
   :column.joined/inner-column inner-column-key})

(mu/defn from-join? :- :boolean
  "Returns true if the given `column-key` is already marked as being explicitly joined by `join-clause-or-uuid`."
  [column-key          :- ::lib.schema.column-key/column-key
   join-clause-or-uuid :- [:or ::lib.schema.join/join ::lib.schema.common/uuid]]
  (and (map? column-key)
       (contains? column-key :column.joined/join-uuid)
       (= (:column.joined/join-uuid column-key)
          (join-uuid join-clause-or-uuid))))

(defn- ->key [column-or-key]
  (if (and (map? column-or-key)
           (= (:lib/type column-or-key) :column/key))
    column-or-key
    (:lib/column-key column-or-key)))

(mu/defn implicitly-joined-via
  "Given a `target-column-or-key` for an implicitly joinable column, and the `fk-column-or-key` for the FK column which
  enables the implicit join, returns the column key for the implicitly joined column."
  [target-column-or-key :- [:or ::lib.schema.metadata/column ::lib.schema.column-key/column-key]
   fk-column-or-key     :- [:or ::lib.schema.metadata/column ::lib.schema.column-key/column-key]]
  {:lib/type                      :column/key
   :column.implicit/fk-column     (->key fk-column-or-key)
   :column.implicit/target-column (->key target-column-or-key)})

(mu/defn from-card
  "Given a `inner-column-or-key` for a column as seen inside a card and the `card-id`, wrap up the inner column key
  as coming from the card."
  [inner-column-or-key :- [:or ::lib.schema.metadata/column ::lib.schema.column-key/column-key]
   card-id             :- [:maybe ::lib.schema.id/card]]
  (cond-> {:lib/type                 :column/key
           :column.card/inner-column (->key inner-column-or-key)}
    card-id (assoc :column.card/card-id card-id)))

(mu/defn opaque-on-card
  "Given a column or its `:lib/desired-column-alias` stage-unique string alias, returns the placeholder column key for
  a column from a card whose definition we don't know at present."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   column-or-alias       :- [:or ::lib.schema.metadata/column ::lib.schema.metadata/desired-column-alias]]
  {:lib/type                        :column/key
   :column.card.opaque/column-alias (or (and (string? column-or-alias) column-or-alias)
                                        (:lib/desired-column-alias column-or-alias)
                                        (lib.field.util/inherited-column-name column-or-alias)
                                        (lib.join.util/desired-alias metadata-providerable column-or-alias)
                                        (throw (ex-info "Failed to identify the unique alias for an opaque column"
                                                        {:column-or-alias column-or-alias})))})

(mu/defn breakout-key :- ::lib.schema.column-key/column-key
  "Given a breakout clause like `[:field ...]`, construct its column key."
  [brk-clause :- ::lib.schema/breakout]
  {:lib/type             :column/key
   :column.breakout/uuid (lib.options/uuid brk-clause)})

(mu/defn aggregation-key :- ::lib.schema.column-key/column-key
  "Given an aggregation clause like `[:max ...]`, construct its column key."
  [agg-clause :- ::lib.schema.aggregation/aggregation]
  {:lib/type                :column/key
   :column.aggregation/uuid (lib.options/uuid agg-clause)})

(mu/defn expression-key :- ::lib.schema.column-key/column-key
  "Given an aggregation clause like `[:max ...]`, construct its column key."
  [expr-clause :- :any] ;; FIXME: Get the right schema.
  {:lib/type               :column/key
   :column.expression/uuid (lib.options/uuid expr-clause)})

(mu/defn native-key :- ::lib.schema.column-key/column-key
  "Given the `unique-column-name` of a native query column, return its column key."
  [unique-column-name :- ::lib.schema.common/non-blank-string]
  {:lib/type                  :column/key
   :column.native/unique-name unique-column-name})
