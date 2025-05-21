(ns metabase.lib.metadata.ident
  "Helpers for working with `:ident` fields on columns."
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ident :as lib.schema.ident]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mu/defn explicitly-joined-ident :- ::lib.schema.ident/joined-ident
  "Returns the ident for an explicitly joined column, given the idents of the join clause and the target column.
  Remember that `:ident` strings should never be parsed - they are opaque, but should be legible during debugging."
  [target-ident    :- ::lib.schema.ident/ident
   join-clause-key :- ::lib.schema.ident/join-clause-unique-key]
  [:ident/joined join-clause-key target-ident])

(mu/defn implicit-join-clause-key :- ::lib.schema.ident/implicit-join-clause-key
  "Returns the unique key for an implicit join clause.

  An implicit join gets a key derived from the FK: `[:ident/implicit-join-via fk-column-ident]`. That's unique since
  there is at most one implicit join per stage per FK. If a FK is duplicated by a double join, those FKs would have
  different idents and so would their implicit joins.

  Note that this supports fully general inner idents, even though Metabase as of 55 only supports implicit join on
  basic Fields."
  [fk-ident :- ::lib.schema.ident/ident]
  [:ident/implicit-join-via fk-ident])

(mu/defn implicitly-joined-ident :- ::lib.schema.ident/joined-ident
  "Returns the ident for an implicitly joined column, given the idents of the foreign key column and the target column."
  [target-ident :- ::lib.schema.ident/ident
   fk-ident     :- ::lib.schema.ident/ident]
  (explicitly-joined-ident target-ident (implicit-join-clause-key fk-ident)))

(mu/defn- ->card-key :- ::lib.schema.ident/card-unique-key
  [card-key-or-id :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  (cond->> card-key-or-id
    (number? card-key-or-id) (vector :ident/card-id)))

(mu/defn model-ident :- ::lib.schema.ident/model-ident
  "Returns the `:ident` for this column on a model. Model columns are deliberately kept distinct from their original
  columns, since models are meant to be treated as opaque sources.

  Prefer calling [[add-model-ident]] if attaching this to a whole column!

  Needs a unique key for the model's card (or its card ID) and the target column's `:ident` within the model."
  [[ident-kind ident-arg :as target-ident] :- ::lib.schema.ident/ident
   card-key-or-id                          :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  ;; Safety check during development. This can't happen, and indicates a coding bug.
  (let [card-key (->card-key card-key-or-id)]
    (when (and (seq target-ident)
               (= ident-kind :ident/model)
               (= ident-arg  card-key))
      (throw (ex-info "Double-bagged!" {:ident    target-ident
                                        :card-key card-key})))
    [:ident/model card-key target-ident]))

(mu/defn add-model-ident :- ::lib.schema.metadata/column
  "Given a column as it appears \"inside\" a model, and the `card-entity-id`, return the column as it appears outside
  the model: with a [[model-ident]] and its inner ident saved to `:model/inner_ident`."
  [{:keys [ident] :as column} :- ::lib.schema.metadata/column
   card-key-or-id             :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  (-> column
      (assoc :model/inner_ident ident)
      (update :ident model-ident card-key-or-id)))

(defn- strip-model-ident
  [[ident-kind model-key inner-ident :as modeled-ident]
   card-key-or-id]
  (let [card-key (->card-key card-key-or-id)]
    (if (and (= ident-kind :ident/model)
             (= model-key  card-key-or-id))
      inner-ident
      (do (log/warnf "Attempting to strip-model-ident for %s but ident is not for that model: %s"
                     card-key modeled-ident)
          modeled-ident))))

(mu/defn remove-model-ident :- ::lib.schema.metadata/column
  "Given a column with a [[model-ident]] style `:ident`, return the original, \"inner\" ident for that column.

  Typically this should come from the `:model/inner_ident` key on the column, which is removed if present.
  Will fall back to destructuring the [[model-ident]] wrapping if necessary."
  [{:keys [ident model/inner_ident] :as column} :- ::lib.schema.metadata/column
   card-key-or-id                               :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  (let [inner_ident (or inner_ident (strip-model-ident ident card-key-or-id))]
    (-> column
        (dissoc :model/inner_ident)
        (assoc :ident inner_ident))))

(mu/defn native-ident :- ::lib.schema.ident/native-ident
  "Returns the `:ident` for a given field name on a native query.

  Requires the name of the column, and the key or ID of the card (which can be a placeholder key)."
  [column-name    :- ::lib.schema.common/non-blank-string
   card-key-or-id :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  [:ident/native (->card-key card-key-or-id) column-name])

(mu/defn remapped-ident :- ::lib.schema.ident/remapped-ident
  "Returns the `:ident` for a \"remapped\" field.

  Note the argument order! Since this wrapper is put on the *extra column* added because something is remapped to it,
  the `target-ident` is the original and `source-ident` is the \"decoration\". This order is tidy for eg.
  `(update extra-mapped-column :ident remapped-ident source-ident)`."
  [target-ident :- ::lib.schema.ident/ident
   source-ident :- ::lib.schema.ident/ident]
  [:ident/remapped source-ident target-ident])

;; ## Placeholder :idents
;; We need a key for the card in native and model idents, but ad-hoc queries don't have an ID yet.
;; In that case we generate a **placeholder** key which gets replaced when the card is saved.

;; This is sailing pretty close to the wind. It wouldn't work so neatly for a multi-stage query, since we might have
;; references to these temporary idents in the later stages. But card keys are only needed for idents on models and
;; native queries. Native queries are single stage, and models have to be saved to become models!
;; So we generate a placeholder and then replace them in `:result_metadata` before saving the card.
(mu/defn placeholder-card-key-for-adhoc-query :- ::lib.schema.common/card-unique-key
  "Returns a placeholder `::lib.schema.ident/card-unique-key` that can be used for an ad-hoc query which does not have
  its ID yet.

  The resulting `:ident`s are temporary, and must not be written to appdb! But they should not be able to \"escape\",
  since they only appear in idents for the columns of models (which must be saved) and native queries
  (which only have one stage, free of refs).

  On saving a card, any occurrences of such a placeholder in the `:ident`s of its `:result_metadata` are updated.
  The placeholders contain a random string so that they are unique even if multiple placeholders are in play.
  (That never happens right now, but it seems like a prudent precaution.)"
  []
  [:ident/card-placeholder (u/generate-nano-id)])

#_(def ^:private illegal-substrings
    #{"$$ADHOC"      ; The tag used in placeholder idents, which should not survive to eg. `:result_metadata` on a Card.
      "native[]"     ; A native column but generated without the containing Card's `entity_id`. This isn't unique!
      "model[]"})    ; A model created without an `entity_id` properly defined.

#_(def ^:private placeholder-regex
    #"\$\$ADHOC\[[A-Za-z0-9_-]{21}\]")

#_(defn- contains-placeholder-ident?
    "Returns true if the given string contains a placeholder."
    [s]
    (and (string? s)
         (boolean (re-matches placeholder-regex s))))

(mu/defn card-placeholder? :- :boolean
  "Returns true if the given ident fragment is **exactly** a placeholder card key."
  [fragment :- :any]
  (and (vector? fragment)
       (= (first fragment) :ident/card-placeholder)))

(mu/defn- contains-card-placeholders? :- :boolean
  "Returns true if there are card key placeholders in this ident, at any level of nesting."
  [ident :- ::lib.schema.ident/ident]
  (boolean (lib.util.match/match ident :ident/card-placeholder)))

(mu/defn replace-placeholder-idents :- [:maybe ::lib.schema.ident/ident]
  "Given an `:ident` and the true card key (or ID) for a card, replace any placeholder card keys in the ident with
  the permanent card key.

  Handles arbitrarily nested idents."
  [ident          :- [:maybe ::lib.schema.ident/ident]
   card-key-or-id :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  (when ident
    (lib.util.match/replace ident
      :ident/card-placeholder
      (->card-key card-key-or-id))))

;; ## Validation of idents
(defn- ->ident [column-or-ident]
  (cond-> column-or-ident
    (map? column-or-ident) :ident))

(mu/defn valid-basic-ident? :- :boolean
  "Validates a generic ident.

  An ident should match the Malli schema, and must not contain any placeholders or blanks, such as an `:ident/native`
  without the card. (This is checked by the schema.)

  Accepts an optional second argument (a `card-key-or-id`) for uniformity with the other validators, but it's unused."
  ([column-or-ident _card-key-or-id]
   (valid-basic-ident? column-or-ident))
  ([column-or-ident :- [:or ::lib.schema.metadata/column ::lib.schema.ident/ident]]
   (let [ident (->ident column-or-ident)]
     (and (mr/validate ::lib.schema.ident/ident ident)
          (not (contains-card-placeholders? ident))))))

(defn- wrapped-ident-validation
  "Checks that the given ident wraps the given card.

  Returns nil if not, and the kind of wrapper (eg. `:ident/model`) if so."
  [column-or-ident card-key-or-id]
  (let [ident    (->ident column-or-ident)
        card-key (->card-key card-key-or-id)]
    (when (= (second ident) card-key)
      (first ident))))

(mu/defn valid-model-ident? :- :boolean
  "Returns whether a given ident (or `:ident` from the column) is correct for the given model."
  [column-or-ident :- [:or ::lib.schema.metadata/column ::lib.schema.ident/ident]
   card-key-or-id  :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  (let [ident    (->ident column-or-ident)
        card-key (->card-key card-key-or-id)]
    (and (mr/validate ::lib.schema.ident/model-ident ident)
         (= (second ident) card-key))))

(mu/defn valid-native-ident? :- :boolean
  "Returns whether a given ident (or `:ident` from a column map) is correct, for the given native card key or ID."
  [column-or-ident :- [:or ::lib.schema.metadata/column ::lib.schema.ident/ident]
   card-key-or-id  :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  (let [ident    (->ident column-or-ident)
        card-key (->card-key card-key-or-id)]
    (and (mr/validate ::lib.schema.ident/native-ident ident)
         (= (second ident) card-key))))

(mu/defn valid-native-model-ident?
  "A special case that checks if a native model's ident is correctly formed."
  [column-or-ident :- [:or ::lib.schema.metadata/column ::lib.schema.ident/ident]
   card-key-or-id  :- [:or ::lib.schema.ident/card-unique-key ::lib.schema.id/card]]
  (let [ident (->ident column-or-ident)]
    (and (valid-model-ident? ident card-key-or-id)
         (valid-native-ident? (nth ident 2) card-key-or-id))))

(def ^:dynamic *enforce-idents-present*
  "The [[assert-idents-present!]] check is sometimes too zealous; this dynamic var can be overridden whe we know the
  query is in a broken state, such as during the cleanup of dangling references in `remove-clause`.

  Defaults to false in production, true in dev and test."
  ;; TODO: Enable this in tests once the QP is adding `:ident`s to `result_metadata`.
  false
  #_#?(:clj      (not config/is-prod?)
       :cljs-dev true
       :default  false))

(defn assert-idents-present!
  "Given a list of columns and map of data for [[ex-info]], throw if any columns in the output lack `:ident`s.

  Return nil if there's no trouble."
  [columns ex-map]
  (when *enforce-idents-present*
    (when-let [missing (seq (remove :ident columns))]
      (throw (ex-info "Some columns are missing :idents"
                      (assoc ex-map :missing-ident missing))))))
