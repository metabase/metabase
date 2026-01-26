(ns metabase.lib.join.util
  "Some small join-related helper functions which are used from a few different namespaces."
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::join-with-optional-alias
  "A Join that may not yet have an `:alias`, which is normally required; [[join]] accepts this and will add a default
  alias if one is not present."
  [:merge
   [:ref ::lib.schema.join/join]
   [:map
    [:alias {:optional true} [:ref ::lib.schema.join/alias]]]])

(mr/def ::partial-join
  "A join that may not yet have an `:alias` or `:conditions`."
  [:merge
   [:ref ::join-with-optional-alias]
   [:map
    [:conditions {:optional true} [:ref ::lib.schema.join/conditions]]]])

(mr/def ::column-or-field-ref
  "A field in a join, either `:metabase.lib.schema.metadata/column` or a `:field` ref."
  [:multi {:dispatch lib.dispatch/dispatch-value}
   [:field              [:ref :mbql.clause/field]]
   [:metadata/column    [:ref ::lib.schema.metadata/column]]
   [:malli.core/default [:fn
                         {:error/message "Should be a :field ref or column metadata"}
                         (constantly false)]]])

(mr/def ::column-or-field-ref-or-partial-join
  "A field or a partial join."
  [:multi {:dispatch lib.dispatch/dispatch-value}
   [:mbql/join          [:ref ::partial-join]]
   [:malli.core/default [:ref ::column-or-field-ref]]])

(mu/defn current-join-alias :- [:maybe ::lib.schema.join/alias]
  "Get the current join alias associated with something, if it has one."
  [field-or-join]
  (case (lib.dispatch/dispatch-value field-or-join)
    :field             (:join-alias (lib.options/options field-or-join))
    :metadata/column   (:metabase.lib.join/join-alias field-or-join)
    :mbql/join         (:alias field-or-join)
    nil))

(mu/defn joined-field-desired-alias :- ::lib.schema.metadata/desired-column-alias
  "Desired alias for a Field that comes from a join, e.g.

    MyJoin__my_field

  You should pass the results thru a unique name function e.g. one returned
  by [[metabase.lib.util.unique-name-generator/unique-name-generator]]."
  [join-alias :- ::lib.schema.common/non-blank-string
   field-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__%s" join-alias field-name))

(mu/defn format-implicit-join-name :- ::lib.schema.join/alias
  "Name for an implicit join against `table-name` via an FK field, e.g.

    CATEGORIES__via__CATEGORY_ID

  For an implicit join made via a join, the join alias is appended to the name:

    CATEGORIES__via__CATEGORY_ID__via__CATEGORIES

  You should make sure this gets ran thru a unique-name fn e.g. one returned
  by [[metabase.lib.util.unique-name-generator/unique-name-generator]]."
  [table-name    :- ::lib.schema.common/non-blank-string
   fk-field-name :- ::lib.schema.common/non-blank-string
   fk-join-alias :- [:maybe ::lib.schema.common/non-blank-string]]
  (if fk-join-alias
    (lib.util/format "%s__via__%s__via__%s" table-name fk-field-name fk-join-alias)
    (lib.util/format "%s__via__%s" table-name fk-field-name)))

(defn implicit-join-name [metadata-providerable {:keys [fk-field-id fk-field-name fk-join-alias table-id], :as _field-metadata}]
  (when (and fk-field-id table-id)
    (when-let [table (lib.metadata/table-or-card metadata-providerable table-id)]
      (let [table-name    (:name table)
            fk-field-name (or fk-field-name (:name (lib.metadata/field metadata-providerable fk-field-id)))]
        (format-implicit-join-name table-name fk-field-name fk-join-alias)))))

(mu/defn desired-alias :- ::lib.schema.metadata/desired-column-alias
  "Desired alias for a Field e.g.

    my_field

    OR

    MyJoin__my_field

  You should pass the results thru a unique name function."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   col                   :- ::lib.schema.metadata/column]
  (or (:lib/ref-name col)
      (let [source-alias ((some-fn :lib/source-column-alias :name) col)]
        (if-let [join-alias (or (current-join-alias col)
                                (implicit-join-name metadata-providerable col))]
          (joined-field-desired-alias join-alias source-alias)
          source-alias))))
