(ns metabase.lib.field.util
  "Some small field-related helper functions which are used from a few different namespaces."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]
   [metabase.util.malli :as mu]))

(mu/defn inherited-column? :- :boolean
  "Is the `column` coming directly from a card, a native query, or a previous query stage?"
  [column :- [:map
              [:lib/source {:optional true} [:maybe ::lib.schema.metadata/column.source]]]]
  (some? (#{:source/card :source/native :source/previous-stage} (:lib/source column))))

(mu/defn inherited-column-name :- [:maybe :string]
  "If the field ref for this `column` should be name-based, returns the name used in the field ref.

  `column` SHOULD BE METADATA RELATIVE TO THE CURRENT STAGE WHERE YOU ARE ADDING THE REF!!!!!!

  Field name refs should use the `:lib/source-column-alias`, e.g.

    [:field {} \"WHATEVER\"]

  which should be the same as the `:lib/desired-column-alias` the previous stage or (last stage of the) join that it
  came from."
  [column :- ::lib.schema.metadata/column]
  (when (inherited-column? column)
    ((some-fn
      ;; broken field refs never use `:lib/source-column-alias`.
      (case lib.ref/*ref-style*
        :ref.style/default :lib/source-column-alias
        :ref.style/broken-legacy-qp-results (constantly nil))
      ;; if this is missing for some reason then fall back to `:name` -- probably wrong, but maybe not and it might
      ;; still work.
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
   (let [deduplicated-name-fn (lib.util.unique-name-generator/non-truncating-unique-name-generator)]
     (map (fn [col]
            (assoc col
                   :lib/original-name ((some-fn :lib/original-name :name) col)
                   :lib/deduplicated-name (deduplicated-name-fn ((some-fn :lib/deduplicated-name :name) col)))))))

  ([cols :- [:sequential ::lib.schema.metadata/column]]
   (into []
         (add-deduplicated-names)
         cols)))

(mu/defn add-source-and-desired-aliases-xform :- fn?
  "Transducer to add `:lib/source-column-alias`, `:lib/desired-column-alias`, `:lib/original-name`, and
  `:lib/deduplicated-name` to a sequence of columns.

    (into [] (add-unique-names-xform) cols)"
  ([query :- ::lib.schema/query]
   ;; do not truncate really long aliases coming back from native queries, if the native query returned it then
   ;; presumably it's ok with the database that ran the query and we need to use the original name to refer back
   ;; to it in subsequent stages.
   ;;
   ;; source alias can be the original name altho I can't really think of a good case for using it in a native
   ;; query. Thus for something like
   ;;
   ;;    SELECT x, x
   ;;
   ;; then:
   ;;
   ;;    | :lib/source-column-alias | :lib/desired-column-alias |
   ;;    |--------------------------+---------------------------|
   ;;    |                        x |                         x |
   ;;    |                        x |                       x_2 |
   ;;
   (let [unique-name-generator (if (lib.util/native-stage? query -1)
                                 (lib.util.unique-name-generator/non-truncating-unique-name-generator)
                                 (lib.util.unique-name-generator/unique-name-generator))]
     (add-source-and-desired-aliases-xform query unique-name-generator)))

  ([metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
    unique-name-fn :- :metabase.lib.util.unique-name-generator/unique-name-generator]
   (comp (add-deduplicated-names)
         (map (fn [col]
                (let [source-alias ((some-fn :lib/source-column-alias :lib/original-name :name) col)
                      desired-alias (unique-name-fn
                                     (lib.join.util/desired-alias metadata-providerable col))
                      current-ja (lib.join.util/current-join-alias col)
                      new-display-name (if current-ja
                                         (str current-ja " → " (:lib/original-name col))
                                         (:display-name col))]
                  (when (and (:metabase.lib.join/join-alias col)
                             (str/includes? (str (:metabase.lib.join/join-alias col)) "Card"))
                    (tap> {:fn :add-source-and-desired-aliases-xform
                           :name (:name col)
                           :lib/original-name (:lib/original-name col)
                           :display-name-in (:display-name col)
                           :current-join-alias current-ja
                           :new-display-name new-display-name}))
                  (assoc col
                         :lib/source-column-alias source-alias
                         :lib/desired-column-alias desired-alias
                         :display-name new-display-name)))))))

(mu/defn update-keys-for-col-from-previous-stage :- [:map
                                                     [:lib/type [:= :metadata/column]]]
  "For a column that came from a previous stage, change the keys for things that mean 'this happened in the current
  stage' to the equivalent keys that mean 'this happened at some stage in the past' e.g.
  `:metabase.lib.join/join-alias` and `:lib/expression-name` become `:lib/original-join-alias` and
  `:lib/original-expression-name` respectively."
  [col :- [:map
           [:lib/type [:= :metadata/column]]]]
  (tap> {:fn :update-keys-for-col-from-previous-stage
         :name (:name col)
         :lib/original-name (:lib/original-name col)
         :lib/desired-column-alias (:lib/desired-column-alias col)
         :display-name (:display-name col)
         :source-alias (:source-alias col)
         :lib/original-join-alias (:lib/original-join-alias col)
         :metabase.lib.join/join-alias (:metabase.lib.join/join-alias col)})
  (let [;; Capture join alias before we strip it
        join-alias (or (:source-alias col)
                       (:lib/original-join-alias col)
                       (:metabase.lib.join/join-alias col))
        ;; Capture display-name before rotation
        display-name (:display-name col)
        ;; Compute new display-name with prefix baked in (if join-alias exists and display-name
        ;; does not already have a prefix). See field-display-name-add-join-alias for the original logic.
        new-display-name (if (and join-alias
                                  display-name
                                  (not (str/includes? display-name " → ")))
                           (str join-alias " → " display-name)
                           display-name)]
    (-> col
        (set/rename-keys {:display-name :lib/original-display-name
                          :fk-field-id :lib/original-fk-field-id
                          :fk-field-name :lib/original-fk-field-name
                          :fk-join-alias :lib/original-fk-join-alias
                          :lib/expression-name :lib/original-expression-name
                          :metabase.lib.field/binning :lib/original-binning
                          :metabase.lib.field/temporal-unit :inherited-temporal-unit
                          :metabase.lib.join/join-alias :lib/original-join-alias})
        (assoc :lib/breakout? false
               :lib/original-name ((some-fn :lib/original-name :name) col)
             ;; desired-column-alias is previous stage => source column alias in next stage
               :lib/source-column-alias ((some-fn :lib/desired-column-alias :lib/source-column-alias :name) col)
               :lib/source :source/previous-stage
             ;; Set new display-name with prefix baked in
               :display-name new-display-name)
      ;;
      ;; Remove `:lib/desired-column-alias`, which needs to be recalculated in the context
      ;; of what is returned by the current stage, to prevent any confusion; its value is likely wrong now and we
      ;; don't want people to get confused by them. `visible-columns` is not supposed to return it, since we can't
      ;; know their value without knowing what is actually returned.
      ;;
      ;; we should OTOH keep `:lib/deduplicated-name`, which is used to calculate subsequent deduplicated
      ;; names, see [[metabase.lib.stage-test/return-correct-deduplicated-names-test]] for an example.
        (dissoc :lib/desired-column-alias)
      ;; Cards should present a "flat table" abstraction - internal joins should not leak to downstream
      ;; queries. Strip join alias keys so display names do not get prefixed. See #65532.
        (dissoc :lib/original-join-alias :source-alias))))
