(ns metabase.lib.metadata.ident
  "Helpers for working with `:ident` fields on columns."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn explicitly-joined-ident
  "Returns the ident for an explicitly joined column, given the idents of the join clause and the target column.
  Remember that `:ident` strings should never be parsed - they are opaque, but should be legible during debugging."
  [target-ident join-ident]
  (str "join[" join-ident "]__" target-ident))

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

  Prefer calling [[add-model-ident]] if attaching this to a whole column!

  Needs the `entity_id` for the model's card and the column's `:ident`."
  [target-ident card-entity-id]
  (when (and (seq target-ident)
             (str/starts-with? target-ident (model-ident "" card-entity-id)))
    (throw (ex-info "Double-bagged!" {:ident target-ident
                                      :eid   card-entity-id})))
  (str "model[" card-entity-id "]__" target-ident))

(defn add-model-ident
  "Given a column with a basic, \"inner\" `:ident` and the `card-entity-id`, returns the column with `:ident` for the
  model and `:model/inner_ident` with the original."
  [{:keys [ident] :as column} card-entity-id]
  (-> column
      (assoc :model/inner_ident ident)
      (update :ident model-ident card-entity-id)))

(defn- strip-model-ident
  [modeled-ident card-entity-id]
  (let [prefix (model-ident "" card-entity-id)]
    (if (str/starts-with? modeled-ident prefix)
      (subs modeled-ident (count prefix))
      (do (log/warnf "Attempting to strip-model-ident for %s but ident is not for that model: %s"
                     card-entity-id modeled-ident)
          modeled-ident))))

(defn remove-model-ident
  "Given a column with a [[model-ident]] style `:ident`, return the original, \"inner\" ident for that column.

  Typically this should come from the `:model/inner_ident` key on the column, which is removed if present.
  Will fall back to parsing the [[model-ident]] prefix if necessary."
  [{:keys [ident model/inner_ident] :as column} card-entity-id]
  (let [inner_ident (or inner_ident (strip-model-ident ident card-entity-id))]
    (-> column
        (dissoc :model/inner_ident)
        (assoc :ident inner_ident))))

(defn native-ident
  "Returns the `:ident` for a given field name on a native query.

  Requires the `entity_id` of the card and the name of the column."
  [column-name card-entity-id]
  (str "native[" card-entity-id "]__" column-name))

(defn remap-ident
  "Returns the `:ident` for a \"remapped\" field."
  [target-ident source-ident]
  (str "remapped[" source-ident "]__to__" target-ident))

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

(def ^:private illegal-substrings
  #{"$$ADHOC"      ; The tag used in placeholder idents, which should not survive to eg. `:result_metadata` on a Card.
    "native[]"     ; A native column but generated without the containing Card's `entity_id`. This isn't unique!
    "model[]"})    ; A model created without an `entity_id` properly defined.

(def ^:private placeholder-regex
  #"\$\$ADHOC\[[A-Za-z0-9_-]{21}\]")

(defn contains-placeholder-ident?
  "Returns true if the given string contains a placeholder."
  [s]
  (and (string? s)
       (boolean (re-matches placeholder-regex s))))

(defn placeholder?
  "Returns true if the given string is **exactly** a placeholder."
  [s]
  (and (contains-placeholder-ident? s)
       (= (count s) 30)))

(defn replace-placeholder-idents
  "Given an `:ident` and the true `:entity_id` for a card, overwrite the placeholders."
  [ident card-entity-id]
  (when ident
    (str/replace ident placeholder-regex card-entity-id)))

;; Validation of idents for various things.
(defn- ->ident [column-or-ident]
  (cond-> column-or-ident
    (map? column-or-ident) :ident))

(defn valid-basic-ident?
  "Validates a generic ident.

  An ident is a nonempty string which does not contain any of the [[illegal-substrings]]: placeholders or malformed
  `native[]` slugs.

  Accepts an optional second argument (a `card-entity-id`) for uniformity with the other validators, but it's unused."
  ([column-or-ident _card-entity-id]
   (valid-basic-ident? column-or-ident))
  ([column-or-ident]
   (let [ident (->ident column-or-ident)]
     (boolean (and (string? ident)
                   (seq ident)
                   (not-any? #(str/includes? ident %) illegal-substrings))))))

(defn- valid-prefixed-ident?
  "Validates an ident, which must be a [[valid-basic-ident?]] and begin with the specified prefix."
  [column-or-ident prefix]
  (let [ident (->ident column-or-ident)]
    (and (valid-basic-ident? ident)
         (str/starts-with? ident prefix))))

(defn valid-model-ident?
  "Returns whether a given ident (or `:ident` from the column) is correct for the given model."
  [column-or-ident card-entity-id]
  (let [ident  (->ident column-or-ident)
        prefix (model-ident "" card-entity-id)]
    (and (valid-prefixed-ident? ident prefix)
         ;; The inner ident can't be empty, or it's also invalid.
         (> (count ident) (count prefix)))))

(defn valid-native-ident?
  "Returns whether a given ident (or `:ident` from a column map) is correct, for the given native card `:entity_id`."
  [column-or-ident card-entity-id]
  (valid-prefixed-ident? column-or-ident (native-ident "" card-entity-id)))

(defn valid-native-model-ident?
  "A special case that checks if a native model's ident is correctly formed:
  `model[CardEntityId]__native[CardEntityId]__columnName`."
  [column-or-ident card-entity-id]
  (let [prefix (-> ""
                   (native-ident card-entity-id)
                   (model-ident card-entity-id))]
    (valid-prefixed-ident? column-or-ident prefix)))

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
