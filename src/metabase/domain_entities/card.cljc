(ns metabase.domain-entities.card
  "Functions for building, updating and querying Cards (that is, Metabase questions)."
  (:require
   [metabase.domain-entities.malli :as de]
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.domain-entities.converters :as converters]
              [malli.core :as mc]
              [malli.util :as mut]
              [metabase.lib.convert :as lib.convert]
              [metabase.lib.js :as lib.js]))))

;;; ----------------------------------- Schemas for Card -----------------------------------------
(def VisualizationSettings
  "Malli schema for `visualization_settings` - a map of strings to opaque JS values."
  [:map-of string? :any])

(def LocalFieldReference
  "Malli schema for a *legacy* field clause for a local field."
  [:tuple
   [:= :field]
   number?
   [:maybe [:map-of string? :any]]])

(def ForeignFieldReference
  "Malli schema for a *legacy* field clause for a foreign field."
  [:tuple
   [:= :field]
   [:or number? string?]
   [:map [:source-field {:js/prop "source-field"} [:or number? string?]]]])

(def VariableTarget
  "Malli schema for a parameter that references a template variable."
  [:tuple [:= :template-tag] string?])

(def ParameterTarget
  "Malli schema for a parameter's target field."
  [:orn
   [:variable [:tuple [:= :variable] VariableTarget]]
   [:dimension [:tuple
                [:= :dimension]
                [:or LocalFieldReference ForeignFieldReference VariableTarget]]]])

(def Parameter
  "Malli schema for each Card.parameters value."
  [:map
   [:id string?]
   [:name string?]
   [:display-name {:optional true :js/prop "display-name"} string?]
   [:slug string?]
   [:type string?]
   [:sectionId {:optional true :js-prep "sectionId"} string?]
   [:default {:optional true} :any]
   [:filtering-parameters {:optional true :js/prop "filteringParameters"} [:vector string?]]
   [:is-multi-select {:optional true :js/prop "isMultiSelect"} boolean?]
   [:required {:optional true} boolean?]
   [:target {:optional true} ParameterTarget]
   [:value {:optional true} :any]
   [:values_query_type {:optional true} :any]
   [:values_source_config {:optional true} :any]
   [:values_source_type {:optional true} :any]])

(def CardNoQuery
  "Base Malli schema for a Card.

  This gives `:any` as the schema for the vital `:dataset_query` key, but that is overridden in [[Card]]."
  [:schema
   [:map
    [:archived {:optional true} boolean?]
    [:average_query_time {:optional true} number?]
    [:breakout-column {:optional true :js/prop "_breakoutColumn"} :any]
    [:breakout-value {:optional true :js/prop "_breakoutValue"} :any]
    [:cache-ttl {:optional true} [:maybe number?]]
    [:can_write {:optional true} boolean?]
    [:collection {:optional true} :any]
    [:collection_id [:maybe number?]]
    [:collection_position [:maybe number?]]
    [:collection_preview boolean?]
    [:created_at [:maybe string?]] ;; TODO: Date regex?
    [:creator {:optional true}
     [:map
      [:id number?]
      [:common_name string?]
      [:date_joined string?] ;; TODO: Date regex
      [:email string?]
      [:first_name  [:maybe string?]]
      [:is_qbnewb boolean?]
      [:is_superuser boolean?]
      [:last_login string?] ;; TODO: Date regex
      [:last_name   [:maybe string?]]]]
    [:creator_id {:optional true} number?]
    [:creation-type {:optional true :js/prop "creationType"} string?]
    [:dashboard_count {:optional true} number?]
    [:dashboard-id {:optional true :js/prop "dashboardId"} number?]
    [:dashcard-id  {:optional true :js/prop "dashcardId"}  number?]
    [:database_id {:optional true} number?]
    [:dataset {:optional true} boolean?]
    [:dataset_query :any] ;; See Card below for the real schema for :dataset_query.
    [:description [:maybe string?]]
    ;; TODO: Display is really an enum but I don't know all its values.
    ;; Known values: table, scalar, gauge, map, area, bar, line. There are more missing for sure.
    [:display string?]
    [:display-is-locked {:optional true :js/prop "displayIsLocked"} boolean?]
    [:embedding_params {:optional true} :any]
    [:enable_embedding {:optional true} boolean?]
    [:entity_id {:optional true} string?]
    [:id {:optional true} [:or number? string?]]
    [:last-edit-info {:optional true :js/prop "last-edit-info"} :any]
    [:last-query-start {:optional true} :any]
    [:made_public_by_id {:optional true} [:maybe number?]]
    [:moderation_reviews {:optional true} [:vector :any]]
    [:name {:optional true} string?]
    [:original_card_id {:optional true} number?]
    [:original_card_name {:optional true :js/prop "originalCardName"} string?]
    [:parameter_mappings {:optional true} [:vector :any]]
    [:parameter_usage_count {:optional true} number?]
    [:parameters {:optional true} [:sequential Parameter]]
    [:persisted {:optional true} boolean?]
    [:public_uuid {:optional true} [:maybe string?]]
    [:query_type {:optional true} string?] ;; TODO: Probably an enum
    [:result_metadata {:optional true} :any]
    [:series_index {:optional true :js/prop "_seriesIndex"} :any]
    [:series_key {:optional true :js/prop "_seriesKey"} :any]
    [:table_id {:optional true} [:maybe number?]]
    [:updated_at {:optional true} string?] ;; TODO: Date regex
    [:visualization_settings VisualizationSettings]]])

(def Card
  "Full schema for Card, with the real schema for `:dataset_query`.

  Queries are special and we want Malli to disregard them. So Malli conversion is done based on [[CardNoQuery]], and
  this is the complete schema for a Card."
  (mut/merge CardNoQuery
             [:map [:dataset_query ::lib.schema/query]]))

#?(:cljs
   (def ^:private ->CardNoQuery
     "Converter from a plain JS object `Card` to a CLJS map for the card.
     Has special handling for the query since we can't capture it well with Malli.
     This returns the Card converting everything but the query, which is left alone."
     (converters/incoming CardNoQuery)))

#?(:cljs
   (def ^:private CardNoQuery->
     "Converter from CLJS map to a plain JS object `Card`.
     Has special handling for the query since we can't capture it well with Malli.
     This returns the Card converting everything but the query, which is left alone."
     (converters/outgoing CardNoQuery)))

;;; ---------------------------------------- Exported API ----------------------------------------
(de/define-getters-and-setters Card
  ;; NOTE: Do not use define-getters-and-setters for `:dataset-query`; it needs special handling.
  display           [:display]
  display-is-locked [:display-is-locked])

#?(:cljs
   (def ^:export from-js
     "Converter from plain JS objects to CLJS maps.
     You should pass this a JS `Card` and an instance of `Metadata`."
     (fn [database-id js-metadata ^js js-card]
       (let [query       (lib.js/query database-id js-metadata (.-dataset_query js-card))
             card        (->CardNoQuery js-card)]
         (assoc card :dataset_query query)))))

#?(:cljs
   (defn ^:export to-js
     "Converter from CLJS maps to plain JS objects."
     [card]
     (let [js-query (lib.js/legacy-query (:dataset_query card))]
       (-> card
           (assoc :dataset_query js-query)
           CardNoQuery->))))

(mu/defn ^:export dataset-query :- ::lib.schema/query
  "Returns the `:dataset_query` of a `Card`.

  This can't be generated by [[de/define-getters-and-setters]] because the conversion of queries requires special
  handling."
  [card :- Card]
  (when-not (map? card)
    (throw (ex-info "dataset-query does not auto-convert; call from-js first" {})))
  (:dataset_query card))

(mu/defn ^:export with-dataset-query :- Card
  "Attaches a `:dataset_query` to a `Card`.

  This can't be generated by [[de/define-getters-and-setters]] because the conversion of queries requires special
  handling.
  "
  [card :- Card dataset-query :- ::lib.schema/query]
  (when-not (map? card)
    (throw (ex-info "with-dataset-query does not auto-convert; call from-js first" {})))
  (when-not (map? dataset-query)
    (throw (ex-info "with-dataset-query does not auto-convert; call lib.js/query first" {})))
  (assoc card :dataset_query dataset-query))

(defn- set-like [inner-schema]
  [:schema [:or [:set inner-schema] [:sequential inner-schema]]])

(mu/defn ^:export maybe-unlock-display :- Card
  "Given current and previous sets of \"sensible\" display settings, check which of them the current `:display` setting
  is in.
  - If it's in the previous set, or the previous set is not defined, consider `:display` formerly sensible.
  - If `:display` is in current set, consider `:display` currently sensible.

  The `:display` should be unlocked if:
  - it was formerly sensible, AND
  - it is not currently sensible, AND
  - the display is currently locked.
  If the display is not currently locked, this never locks it."
  ([card :- Card
    current-sensible-displays :- (set-like string?)]
   (maybe-unlock-display card current-sensible-displays nil))

  ([card :- Card
    current-sensible-displays  :- (set-like string?)
    previous-sensible-displays :- [:maybe (set-like string?)]]
   (let [dsp                 (display card)
         previous            (set previous-sensible-displays)
         current             (set current-sensible-displays)
         formerly-sensible?  (or (empty? previous) (previous dsp)) ; An empty previous set is always sensible.
         currently-sensible? (current dsp)
         should-unlock?      (and formerly-sensible? (not currently-sensible?))]
     (with-display-is-locked card (and (display-is-locked card)
                                       (not should-unlock?))))))
