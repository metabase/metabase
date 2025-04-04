(ns metabase.lib.metadata.ident
  "Helpers for working with `:ident` fields on columns."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(defn explicitly-joined-ident
  "Returns the ident for an explicitly joined column, given the idents of the join clause and the target column.
  Remember that `:ident` strings should never be parsed - they are opaque, but should be legible during debugging."
  [target-ident join-ident]
  (str "join__" join-ident "__" target-ident))

(defn implicit-join-clause-ident
  "Returns the ident for an implicit join **clause**.

  The join clause's ident is derived from the FK column's ident: `implicit_via__IdentOfFK`."
  [fk-ident]
  (str "implicit_via__" fk-ident))

(defn implicitly-joined-ident
  "Returns the ident for an implicitly joined column, given the idents of the foreign key column and the target column.

  Remember that `:ident` strings should never be parsed - they are opaque, but should be legible during debugging."
  [target-ident fk-ident]
  (explicitly-joined-ident target-ident (implicit-join-clause-ident fk-ident)))

(defn model-ident
  "Returns the `:ident` for this column on a model.

  Needs the `entity_id` for the model's card and the column's `:ident`."
  [target-ident card-entity-id]
  (str "model__" card-entity-id "__" target-ident))

(defn native-ident
  "Returns the `:ident` for a given field name on a native query.

  Requires the `entity_id` of the card and the name of the column."
  [column-name card-entity-id]
  (str "native__" card-entity-id "__" column-name))

(defn remap-ident
  "Returns the `:ident` for a \"remapped\" field."
  [target-ident source-ident]
  (str "remapped__" source-ident "__to__" target-ident))

;; ## Placeholder :idents
;; We need the `:entity_id` of the card for native and model idents, but ad-hoc queries don't have an `:entity_id`
;; yet. In that case we generate a **placeholder** `:entity_id` which gets replaced when the card is saved.

;; This is sailing pretty close to the wind. It wouldn't work so neatly for a multi-stage query, since we might have
;; references to these temporary idents in the later stages. But Card `:entity_id`s are only needed for idents on
;; models and native queries. Native queries are single stage, and models have to be saved to become models!
;; So we generate a placeholder `:entity_id` and then replace them in `:result_metadata` before saving the card.
(defn placeholder-card-entity-id-for-adhoc-query
  "Returns a string that can be used as a placeholder for the `:entity_id` of a card, when running an ad-hoc query.

  The resulting `:ident`s are temporary! But they should not be able to \"escape\", since they only appear in idents
  for the columns of models (which must be saved) and native queries (which only have one stage, free of refs).

  On saving a card, any occurrences of such a placeholder in the `:ident`s of its `:result_metadata` are updated.

  These placeholders deliberately contain characters which are not in the NanoID alphabet."
  []
  (str "$$ADHOC[" (u/generate-nano-id) "]"))

(def ^:private placeholder-prefixes
  #{"$$ADHOC"})

(def ^:private placeholder-regex
  #"\$\$ADHOC\[[A-Za-z0-9_-]{21}\]")

(defn replace-placeholder-idents
  "Given an `:ident` and the true `:entity_id` for a card, overwrite the placeholders."
  [ident card-entity-id]
  (str/replace ident placeholder-regex card-entity-id))

(comment
  (let [placeholder-ident (native-ident "SOME_COLUMN" (placeholder-card-entity-id-for-adhoc-query))
        card-entity-id    (u/generate-nano-id)
        replaced-ident    (replace-placeholder-idents placeholder-ident card-entity-id)]
    [placeholder-ident card-entity-id '=> replaced-ident]))

;; Validation of idents for various things.
(defn- ->ident [column-or-ident]
  (cond-> column-or-ident
    (map? column-or-ident) :ident))

(defn valid-basic-ident?
  "Validates a generic ident: a nonempty string, and no illegal placeholders.

  Accepts an optional second argument (a `card-entity-id`) for uniformity with the other validators, but it's unused."
  ([column-or-ident _card-entity-id]
   (valid-basic-ident? column-or-ident))
  ([column-or-ident]
   (let [ident (->ident column-or-ident)]
     (boolean (and (string? ident)
                   (seq ident)
                   (nil? (some #(str/index-of ident %) placeholder-prefixes)))))))

(defn valid-model-ident?
  "Returns whether a given ident (or `:ident` from the column) is correct for the given model."
  [column-or-ident card-entity-id]
  (let [ident  (->ident column-or-ident)
        prefix (model-ident "" card-entity-id)]
    (and (string? ident)
         (valid-basic-ident? ident)
         (str/starts-with? ident prefix)
         ;; The inner ident can't be empty, or it's also invalid.
         (> (count ident) (count prefix)))))

(defn valid-native-ident?
  "Returns whether a given ident (or `:ident` from a column map) is correct, for the given native card `:entity_id`."
  [column-or-ident card-entity-id]
  (let [ident  (->ident column-or-ident)
        prefix (native-ident "" card-entity-id)]
    (and (string? ident)
         (valid-basic-ident? ident)
         (str/starts-with? ident prefix))))

(defn valid-native-model-ident?
  "A special case that checks if a native model's ident is correctly formed:
  `model__CardEntityId__native__CardEntityId__columnName`."
  [column-or-ident card-entity-id]
  (let [ident  (->ident column-or-ident)
        prefix (-> ""
                   (native-ident card-entity-id)
                   (model-ident card-entity-id))]
    (and (string? ident)
         (valid-basic-ident? ident)
         (str/starts-with? ident prefix))))

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
