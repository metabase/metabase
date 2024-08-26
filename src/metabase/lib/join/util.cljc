(ns metabase.lib.join.util
  "Some small join-related helper functions which are used from a few different namespaces."
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(def JoinWithOptionalAlias
  "A Join that may not yet have an `:alias`, which is normally required; [[join]] accepts this and will add a default
  alias if one is not present."
  [:merge
   [:ref ::lib.schema.join/join]
   [:map
    [:alias {:optional true} [:ref ::lib.schema.join/alias]]]])

(def PartialJoin
  "A join that may not yet have an `:alias` or `:conditions`."
  [:merge
   JoinWithOptionalAlias
   [:map
    [:conditions {:optional true} [:ref ::lib.schema.join/conditions]]]])

(def Field
  "A field in a join, either `:metabase.lib.schema.metadata/column` or a `:field` ref."
  [:or
   [:ref ::lib.schema.metadata/column]
   [:ref :mbql.clause/field]])

(def FieldOrPartialJoin
  "A field or a partial join."
  [:or Field PartialJoin])

(mu/defn current-join-alias :- [:maybe ::lib.schema.common/non-blank-string]
  "Get the current join alias associated with something, if it has one."
  [field-or-join :- [:maybe FieldOrPartialJoin]]
  (case (lib.dispatch/dispatch-value field-or-join)
    :dispatch-type/nil nil
    :field             (:join-alias (lib.options/options field-or-join))
    :metadata/column   (:metabase.lib.join/join-alias field-or-join)
    :mbql/join         (:alias field-or-join)))

(mu/defn joined-field-desired-alias :- ::lib.schema.common/non-blank-string
  "Desired alias for a Field that comes from a join, e.g.

    MyJoin__my_field

  You should pass the results thru a unique name function e.g. one returned
  by [[metabase.lib.util/unique-name-generator]]."
  [join-alias :- ::lib.schema.common/non-blank-string
   field-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__%s" join-alias field-name))

(mu/defn format-implicit-join-name :- ::lib.schema.common/non-blank-string
  "Name for an implicit join against `table-name` via an FK field, e.g.

    CATEGORIES__via__CATEGORY_ID

  You should make sure this gets ran thru a unique-name fn e.g. one returned
  by [[metabase.lib.util/unique-name-generator]]."
  [table-name           :- ::lib.schema.common/non-blank-string
   source-field-id-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__via__%s" table-name source-field-id-name))

(defn- implicit-join-name [query {:keys [fk-field-id table-id], :as _field-metadata}]
  (when (and fk-field-id table-id)
    (when-let [table (lib.metadata/table-or-card query table-id)]
      (let [table-name           (:name table)
            source-field-id-name (:name (lib.metadata/field query fk-field-id))]
        (format-implicit-join-name table-name source-field-id-name)))))

(mu/defn desired-alias :- ::lib.schema.common/non-blank-string
  "Desired alias for a Field e.g.

    my_field

    OR

    MyJoin__my_field

  You should pass the results thru a unique name function."
  [query          :- ::lib.schema/query
   field-metadata :- ::lib.schema.metadata/column]
  (if-let [join-alias (or (current-join-alias field-metadata)
                          (implicit-join-name query field-metadata))]
    (joined-field-desired-alias join-alias (:name field-metadata))
    (:name field-metadata)))
