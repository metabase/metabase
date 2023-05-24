(ns metabase.lib.names
  (:require
   [clojure.string :as str]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]))

(defn column-display-name
  "Helper for the display name of a field, expression, etc."
  [query
   stage-number
   {field-display-name :display-name
    field-name         :name
    temporal-unit      :unit
    binning            :binning
    join-alias         :source_alias
    fk-field-id        :fk-field-id
    table-id           :table-id
    :as                column-metadata}
   style]
  (let [field-display-name (or field-display-name
                               (u.humanization/name->human-readable-name :simple field-name))
        join-display-name  (when (= style :long)
                             (or
                               (when fk-field-id

                                 ;; Implicitly joined column pickers don't use the target table's name, they use the FK field's name with
                                 ;; "ID" dropped instead.
                                 ;; This is very intentional: one table might have several FKs to one foreign table, each with different
                                 ;; meaning (eg. ORDERS.customer_id vs. ORDERS.supplier_id both linking to a PEOPLE table).
                                 ;; See #30109 for more details.
                                 (if-let [field (lib.metadata/field query fk-field-id)]
                                   (-> (lib.metadata.calculation/display-info query stage-number field)
                                       :display-name
                                       lib.util/strip-id)
                                   (let [table (lib.metadata/table query table-id)]
                                     (lib.metadata.calculation/display-name query stage-number table style))))
                               (when join-alias
                                 (let [join (lib.join/resolve-join query stage-number join-alias)]
                                   (lib.metadata.calculation/display-name query stage-number join style)))))
        display-name       (if join-display-name
                             (str join-display-name " → " field-display-name)
                             field-display-name)]
    (cond
      temporal-unit (lib.util/format "%s: %s" display-name (-> (name temporal-unit)
                                                               (str/replace \- \space)
                                                               u/capitalize-en))
      binning       (lib.util/format "%s: %s" display-name (lib.binning/binning-display-name binning column-metadata))
      :else         display-name)))
