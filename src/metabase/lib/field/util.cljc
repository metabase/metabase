(ns metabase.lib.field.util
  "Some small field-related helper functions which are used from a few different namespaces."
  (:require
   [clojure.set :as set]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

;;; TODO (Cam 6/24/25) -- this is fundamentally broken -- see QUE-1375
(mu/defn inherited-column? :- :boolean
  "Is the `column` coming directly from a card, a native query, or a previous query stage?"
  [column :- [:map
              [:lib/source {:optional true} ::lib.schema.metadata/column-source]]]
  (some? (#{:source/card :source/native :source/previous-stage} (:lib/source column))))

(defn FIXED-inherited-column?
  "Attempt at working around QUE-1375 until we can actually fix it the right way."
  [query stage-number column]
  (or
   (inherited-column? column)
   ;; if a column's source is `:source/fields` or `:source/breakouts`, that means it either came from the previous
   ;; stage, or the source table or a join in this stage. So we can determine if it was from the previous stage if
   ;;
   ;; 1. there is a previous stage (or source card), and
   ;;
   ;; 2a. it DOES NOT have a join alias, OR
   ;;
   ;; 2b. it HAS a join alias, but that alias is not for a join in the current stage
   (and
    (#{:source/fields :source/breakouts} (:lib/source column))
    ;; 1. there is a previous stage (or source card)
    (or (not (lib.util/first-stage? query stage-number))
        (lib.util/source-card-id query))
    (let [join-alias ((some-fn :metabase.lib.join/join-alias :lib/original-join-alias) column)]
      (or
       ;; 2a. it DOES NOT have a join alias
       (not join-alias)
       ;; 2b. it HAS a join alias, but that alias is not for a join in the current stage
       (every? #(not= (:alias %) join-alias)
               (:joins (lib.util/query-stage query stage-number))))))))

(mu/defn inherited-column-name :- [:maybe :string]
  "If the field ref for this `column` should be name-based, returns the name used in the field ref.

  Assumes `column` metadata is relative to the same stage you are going to use the ref in."
  [column :- ::lib.schema.metadata/column]
  (when (inherited-column? column)
    ((some-fn
      ;; field name refs should use the source column alias (source column alias in current stage == desired column
      ;; alias from previous stage); assumes this metadata is relative to the current stage.
      :lib/source-column-alias
      :lib/deduplicated-name
      :lib/original-name
      :name)
     column)))

(defn add-deduplicated-names-xform
  "Transducer version of [[add-deduplicated-names]]."
  []
  (let [deduplicated-name-fn (lib.util/non-truncating-unique-name-generator)]
    (map (fn [col]
           (let [original-name ((some-fn :lib/original-name :name) col)]
             (assoc col
                    :lib/original-name     original-name
                    :lib/deduplicated-name (deduplicated-name-fn (:name col))))))))

(mu/defn add-deduplicated-names :- [:sequential
                                    [:merge
                                     ::lib.schema.metadata/column
                                     [:map
                                      [:lib/deduplicated-name :string]]]]
  "Add `:lib/original-name` and `:lib/deduplicated-name` to columns if they don't already have them."
  [cols :- [:sequential ::lib.schema.metadata/column]]
  (into []
        (add-deduplicated-names-xform)
        cols))

(mu/defn add-source-and-desired-aliases-xform :- fn?
  "Transducer to add `:lib/source-column-alias`, `:lib/desired-column-alias`, `:lib/original-name`, and
  `:lib/deduplicated-name` to a sequence of columns.

    (into [] (add-unique-names-xform) cols)"
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable]
  (comp (add-deduplicated-names-xform)
        (let [unique-name-fn (lib.util/unique-name-generator)]
          (map (fn [col]
                 (let [source-alias  ((some-fn :lib/source-column-alias :name) col)
                       desired-alias (unique-name-fn
                                      (lib.join.util/desired-alias metadata-providerable col))]
                   (assoc col
                          :lib/source-column-alias  source-alias
                          :lib/desired-column-alias desired-alias)))))))

(defn update-keys-for-col-from-previous-stage
  "For a column that came from a previous stage, change the keys for things that mean 'this happened in the current
  stage' to the equivalent keys that mean 'this happened at some stage in the past' e.g.
  `:metabase.lib.join/join-alias` and `:lib/expression-name` become `:lib/original-join-alias` and
  `:lib/original-expression-name` respectively."
  [col]
  (-> col
      (set/rename-keys {:fk-field-id                      :lib/original-fk-field-id
                        :fk-field-name                    :lib/original-fk-field-name
                        :fk-join-alias                    :lib/original-fk-join-alias
                        :lib/expression-name              :lib/original-expression-name
                        :metabase.lib.field/binning       :lib/original-binning
                        :metabase.lib.field/temporal-unit :inherited-temporal-unit
                        :metabase.lib.join/join-alias     :lib/original-join-alias})
      ;; TODO (Cam 6/26/25) -- should we set `:lib/original-display-name` here too?
      (assoc :lib/original-name ((some-fn :lib/original-name :name) col)
             ;; desired-column-alias is previous stage => source column alias in next stage
             :lib/source-column-alias ((some-fn :lib/desired-column-alias :lib/source-column-alias :name) col))))
