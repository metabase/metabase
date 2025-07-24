(ns metabase.lib.field.util
  "Some small field-related helper functions which are used from a few different namespaces."
  (:require
   [clojure.set :as set]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn inherited-column? :- :boolean
  "Is the `column` coming directly from a card, a native query, or a previous query stage?"
  [column :- [:map
              [:lib/source {:optional true} ::lib.schema.metadata/column.source]]]
  (some? (#{:source/card :source/native :source/previous-stage} (:lib/source column))))

(mu/defn inherited-column-name :- [:maybe :string]
  "If the field ref for this `column` should be name-based, returns the name used in the field ref."
  [column :- ::lib.schema.metadata/column]
  (when (inherited-column? column)
    ((some-fn
      ;; broken field refs never use `:lib/desired-column-alias`.
      (case lib.ref/*ref-style*
        :ref.style/default                  :lib/desired-column-alias
        :ref.style/broken-legacy-qp-results (constantly nil))
      :lib/deduplicated-name
      :lib/original-name
      :name)
     column)))

(mu/defn add-deduplicated-names :- [:or
                                    ;; zero-arity: transducer
                                    fn?
                                    ;; one-arity
                                    [:sequential
                                     [:merge
                                      ::lib.schema.metadata/column
                                      [:map
                                       [:lib/deduplicated-name :string]]]]]
  "Add `:lib/original-name` and `:lib/deduplicated-name` to columns if they don't already have them.

  The zero arity is a transducer version."
  ([]
   (let [deduplicated-name-fn (lib.util/non-truncating-unique-name-generator)]
     (map (fn [col]
            (let [original-name ((some-fn :lib/original-name :name) col)]
              (assoc col
                     :lib/original-name     original-name
                     :lib/deduplicated-name (deduplicated-name-fn ((some-fn :lib/deduplicated-name :name) col))))))))

  ([cols :- [:sequential ::lib.schema.metadata/column]]
   (into []
         (add-deduplicated-names)
         cols)))

(mu/defn add-source-and-desired-aliases-xform :- fn?
  "Transducer to add `:lib/source-column-alias`, `:lib/desired-column-alias`, `:lib/original-name`, and
  `:lib/deduplicated-name` to a sequence of columns.

    (into [] (add-unique-names-xform) cols)"
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable]
  (comp (add-deduplicated-names)
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
      (assoc :lib/breakout? false)
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
