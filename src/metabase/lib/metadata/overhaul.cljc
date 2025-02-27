(ns metabase.lib.metadata.overhaul
  "Helpers and utilities during the transition to the new world for `:ident`-based refs."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def ^:dynamic *overhaul-selector*
  "Enumerated setting that controls whether we're using old refs and metadata, or new refs and metadata.

  **DO NOT** test this directly - use [[new-refs?]] or [[old-refs?]] instead.
  This is only exported so it can be overridden in tests.

  - `:old-only` and `:new-only` are self-explanatory.
  - `:old-wins` runs **both** versions, but returns the old version's output.
  - `:new-wins` is the reverse.

  Current default is `:old-only`."
  :old-only)

(defn new-refs?
  "Returns true if the library is operating in **new refs** mode.

  Note that queries are not compatible between modes! The mode must be consistent for the entire life of a query."
  []
  (= *overhaul-selector* :new-only))

(defn old-refs?
  "Returns true if the library is operating in **old refs** mode.

  Note that queries are not compatible between modes! The mode must be consistent for the entire life of a query."
  []
  (= *overhaul-selector* :old-only))

(defn old-new
  "Given two functions `old-fn` and `new-fn` with the same arguments, this returns the appropriate function based on
  the current [[*overhaul-selector*]]."
  [old-fn new-fn]
  (if (new-refs?)
    new-fn
    old-fn))

(mr/def ::common
  "These are the parts which are universal, common to all columns whatever their source."
  [:map
   ;; TODO: Using this variant type is temporary; it should take over `:metadata/column` eventually.
   [:lib/type            [:= ::column]]
   [:column/ident        ::lib.schema.common/non-blank-string]

   ;; NOTE: Some databases seem to allow blank column names!? `:column/name` should be set to `""` if it's blank.
   ;; TODO: It seems from the original discussion that this is an accident of metadata fetching, and may no longer
   ;; really happen. Investigate that and see if we can bring back `non-blank-string` for names.
   ;; See https://metaboat.slack.com/archives/C04DN5VRQM6/p1686841551319789
   ;; TODO: Even more radical, but - why do we need :name on general columns? Nobody should be using it!
   ;; We do need display names, but those can be generated (and disambiguated) on the fly.
   ;; I'm going to omit this for now and see how far we can go with it...
   #_[:column/name         :string]
   [:column/display-name {:optional true} ::lib.schema.common/non-blank-string]

   ;; Deliberately combining `:effective-type` and `:base-type` under one label.
   ;; This is the type of this column as it should be treated in Metabase.
   ;; If the *representation* differs from the *value*, eg. a datetime encoded as an ISO string, this should be
   ;; `:type/DateTime` and other properties (not currently defined) will specify the underlying representation and/or
   ;; the coercion being applied.
   [:column/type         ::lib.schema.common/base-type]

   ;; If present, this is the :ident of a target column, typically the PK of another table.
   ;; Using an ident here is strictly more flexible than an ID, since it could target eg. a column on a model.
   [:column/fk-target-ident {:optional true} ::lib.schema.common/non-blank-string]])

;; **On some "missing" metadata keys
;; - source-alias and desired-alias are missing; these are SQL-level concerns and can be ignored by the library.
;;   - :idents can be used instead to refer uniquely to columns
;;   - :name might not be unique!

(mr/def ::source-extras
  "**Source** columns are those that come from some source external to our query: tables or cards. Sources return not
  a *set* of columns but a *list*, with a defined order. Hence `:column.source/position` is defined on such cards."
  [:map
   [:column.source/position [:int {:min 0}]]])

(mr/def ::field-specific
  "Proper Fields that live in the user's data warehouse have these keys."
  [:map
   [:field/id       ::lib.schema.id/field]
   [:field/table-id ::lib.schema.id/table]
   ;; Fields have names, but columns don't necessarily.
   ;; TODO: I'm leaving this out too until something actually needs it.
   #_[:field/name     ::lib.schema.common/non-blank-string]])

(mr/def ::card-extras
  "When a column comes from a card, we include the ID of that card so that we can fetch the card's details for use in
  `display-info`, display names, etc."
  [:merge
   ::source-extras
   [:map
    [:column/card-id ::lib.schema.id/card]]])

(mr/def ::field
  "Schema for a proper Field from the user's DWH.

  Fields have a few specific properties, and are also *source columns*."
  [:merge ::common ::field-specific ::source-extras])

(mr/def ::column
  "Schema for a proper Field from the user's DWH. Merging `::common` and `::field-specific`."
  [:ref ::common])

(mr/def ::column-from-card
  "Schema for a proper Field from the user's DWH. Merging `::common` and `::field-specific`."
  [:merge ::common ::card-extras])

(def ^:private field-keys
  (let [the-keys (-> (mr/schema ::field-specific) mc/explicit-keys)]
    (when-not (some #{:field/id} the-keys)
      (throw (ex-info "Could not calculate field-keys - make sure the schema is being extracted properly"
                      {:schema (mr/schema ::field-specific)
                       :keys   the-keys})))
    the-keys))

(defn- validate-column-metadata [column]
  (when-let [err (or (mr/explain ::common column)
                     (when (some column field-keys)
                       (mr/explain ::field-specific column)))]
    (throw (ex-info "bad new-refs column!" {:error err}))))

(defn- validated-column:old-refs [column]
  column)

(defn- validated-column:new-refs [column]
  (validate-column-metadata column)
  column)

(comment
  ;; Preserving this handful of validators for now - not sure they'll be useful.
  validated-column:old-refs
  validated-column:new-refs)

(def ^:private global-column-cache
  (atom {:ident->col {}
         :id->ident  {}}))

(defn- register [cache {:keys [column/ident field/id] :as column}]
  (when-not ident
    (throw (ex-info "Cannot register! a column with no ident" {:column column})))
  (cond-> (assoc-in cache [:ident->col ident] column)
    id (assoc-in [:id->ident id] ident)))

(mu/defn register! :- ::column
  "Registers a new style column into the global column cache.

  Idempotent, so call it whenever a column might have changed.

  **Returns the column itself, for easy chaining.**"
  [column :- ::column]
  (swap! global-column-cache register column)
  column)

(mu/defn register-all! :- [:sequential ::column]
  "Registers a seq of columns into the global column cache.

  Like [[register!]], but it only updates the atom once.

  **Returns the original `columns` list, for easy chaining.**"
  [columns :- [:sequential ::column]]
  (swap! global-column-cache #(reduce register % columns))
  columns)

(mu/defn lookup-ident :- [:maybe ::column]
  "Looks up a column in the global column cache by its ident.

  Returns nil if not found."
  [ident :- :string]
  (get-in @global-column-cache [:ident->col ident]))

(mu/defn ident->id :- [:maybe ::lib.schema.id/field]
  "Looks up the Field ID for the given ident.

  Returns nil if (1) the ident is unknown, or (2) that column is not a plain Field."
  [ident :- :string]
  (-> ident lookup-ident :field/id))
