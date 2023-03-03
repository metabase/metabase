(ns metabase.domain-entities.card
  "Functions for building, updating and querying Cards (that is, Metabase questions)."
  (:require
   [metabase.domain-entities.malli :as de]
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli :as mu]
   #?@(:cljs ([metabase.domain-entities.converters :as converters]
              [metabase.lib.query :as lib.query]
              [metabase.lib.schema.id :as lib.schema.id]
              [metabase.lib.util :as lib.util]))))

;;; ---------------------------------- Schemas for legacy MBQL -----------------------------------
;;; The JS side provides and expects the classic MBQL format. These Legacy* schemas are for that
;;; format, which we use to convert in both directions.
;;; See [[incoming-query]] and [[outgoing-query]].
#?(:cljs
   (def ^:private LegacyNativeQuery
     [:map
      [:query string?]
      [:template-tags {:optional true :js/prop "template-tags"}
       [:map-of string? :any]]]))

#?(:cljs
   (def ^:private LegacyAggregation
     [:tuple [:= "count"]]))

#?(:cljs
   (def ^:private LegacyLocalFieldReference
     [:tuple
      [:= "field"]
      ::lib.schema.id/field
      [:maybe [:map-of string? :any]]]))

#?(:cljs
   (def ^:private LegacyForeignFieldReference
     [:tuple
      [:= "field"]
      ::lib.schema.id/field
      [:map
       [:source-field {:js/prop "source-field"} [:or ::lib.schema.id/field string?]]]]))

#?(:cljs
   (def ^:private LegacyFieldReference
     [:or LegacyLocalFieldReference LegacyForeignFieldReference]))

#?(:cljs
   (def ^:private LegacyStructuredQuery
     [:schema
      {:registry {::query [:map
                           [:source-table {:optional true :js/prop "source-table"}
                            number?]
                           [:source-query {:optional true :js/prop "source-query"}
                            [:ref ::query]]
                           [:aggregation {:optional true} [:sequential LegacyAggregation]]
                           [:breakout    {:optional true} [:sequential LegacyFieldReference]]
                           ;; TODO: Lots more fields to fill in here.
                           ]}}
      [:ref ::query]]))

#?(:cljs
   (def ^:private LegacyDatasetQuery
     [:map
      [:type [:enum :native :query]]
      [:database {:optional true} ::lib.schema.id/database]
      [:native {:optional true} LegacyNativeQuery]
      [:query {:optional true} LegacyStructuredQuery]
      [:parameters {:optional true} [:sequential :any]]]))

(def ^:private incoming-query
  #?(:cljs (let [->LegacyDatasetQuery (converters/incoming LegacyDatasetQuery)]
             #(-> % ->LegacyDatasetQuery lib.query/query))
     :clj  identity))

(def ^:private outgoing-query
  #?(:cljs (let [LegacyDatasetQuery-> (converters/outgoing LegacyDatasetQuery)]
             #(-> % lib.util/depipeline LegacyDatasetQuery->))
     :clj  identity))

;;; ----------------------------------- Schemas for Card -----------------------------------------
(def VisualizationSettings
  "Malli schema for `visualization_settings` - a map of strings to opaque JS values."
  [:map-of string? :any])

(def Parameter
  "Malli schema for each Card.parameters value."
  [:map
   [:id string?]
   [:name string?]
   [:display-name {:optional true :js/prop "display-name"} string?]
   [:type string?]
   [:slug string?]
   [:sectionId {:optional true :js-prep "sectionId"} string?]
   [:default {:optional true} :any]
   [:required {:optional true} boolean?]
   [:filtering-parameters {:optional true :js/prop "filteringParameters"} [:vector string?]]
   [:is-multi-select {:optional true :js/prop "isMultiSelect"} boolean?]
   [:value {:optional true} :any]])

(def Card
  "Malli schema for a possibly-saved Card."
  [:map
   [:dataset_query
    ;; Custom encoding and decoding for :dataset-query to convert JS legacy MBQL <-> CLJS pMBQL.
    {:decode/js incoming-query
     :encode/js outgoing-query}
    ::lib.schema/query]
   ;; TODO: Display is really an enum but I don't know all its values.
   ;; Known values: table, scalar, gauge, map, area, bar, line. There are more missing for sure.
   [:display string?]
   [:visualization_settings VisualizationSettings]
   [:parameters {:optional true} [:sequential Parameter]]
   [:dashboard-id {:optional true :js/prop "dashboardId"} number?]
   [:dashcard-id  {:optional true :js/prop "dashcardId"}  number?]
   [:original_card_id {:optional true} number?]
   [:persisted {:optional true} boolean?]
   [:last-edit-info {:optional true :js/prop "last-edit-info"} :any]
   [:last-query-start {:optional true} :any]
   [:moderation-reviews {:optional true} [:vector :any]]
   [:id {:optional true} [:or number? string?]]
   [:name {:optional true} string?]
   [:description {:optional true} [:maybe string?]]
   [:dataset {:optional true} boolean?]
   [:can-write {:optional true} boolean?]
   [:creation-type {:optional true :js/prop "creationType"} string?]
   [:public-uuid {:optional true} string?]
   [:cache-ttl {:optional true} [:maybe number?]]
   [:archived {:optional true} boolean?]
   [:collection_id {:optional true} [:maybe number?]]
   [:collection_position {:optional true} [:maybe number?]]
   [:display-is-locked {:optional true :js/prop "displayIsLocked"} boolean?]
   [:parameter-usage-count {:optional true} number?]
   [:result_metadata {:optional true} :any]
   [:creator {:optional true}
    [:map
     [:id number?]
     [:common_name string?]
     [:first_name  [:maybe string?]]
     [:last_name   [:maybe string?]]
     [:email string?]
     [:last_login string?]
     [:date_joined string?]]]])

;;; ---------------------------------------- Exported API ----------------------------------------
(de/define-getters-and-setters Card
  display           [:display]
  display-is-locked [:display-is-locked])

(def ^:export from-js
  "Converter from plain JS objects to CLJS maps; does nothing in CLJ."
  #?(:cljs (converters/incoming Card)
     :clj  identity))

(def ^:export to-js
  "Converter from CLJS maps to plain JS objects; does nothing in CLJ."
  #?(:cljs (converters/outgoing Card)
     :clj  identity))

(defn- set-like [inner-schema]
  [:or [:set inner-schema] [:sequential inner-schema]])

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
