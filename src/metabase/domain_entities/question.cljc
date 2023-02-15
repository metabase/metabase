(ns metabase.domain-entities.question
  (:require
   [metabase.domain-entities.malli :as de]
   [metabase.util :as u]
   #?@(:cljs ([metabase.domain-entities.converters :as converters]))))

(def DatabaseId
  "Malli schema for a database ID."
  number?)

(def FieldId
  "Malli schema for a field ID."
  number?)

(def LocalFieldReference
  "Malli schema for a local field reference, in a query."
  [:tuple
   [:and string? [:= "field"]]
   FieldId
   [:maybe [:map-of string? :any]]])

(def ForeignFieldReference
  "Malli schema for a foreign field reference, in a query."
  [:tuple
   [:and string? [:= "field"]]
   FieldId
   [:map
    [:source-field {:js/prop "source-field"} [:or FieldId string?]]]])

(def VariableTarget
  "Malli schema for a parameter targeting a variable."
  [:tuple
   [:and string? [:= "template-tag"]]
   string?])

(def ParameterQueryObject
  "Malli schema for a parameter in a query."
  [:map
   [:type string?]
   [:target [:orn
             [:variable [:tuple
                         [:and string? [:= "variable"]]
                         VariableTarget]]
             [:dimension [:tuple
                          [:and string? [:= "dimension"]]
                          [:orn
                           [:dimension [:orn
                                        [:local   LocalFieldReference]
                                        [:foreign ForeignFieldReference]]]
                           [:variable VariableTarget]]]]]]])

(def StructuredQuery
  "Malli schema for an MBQL query."
  [:schema
   {:registry
    ;; TODO Lots more fields to fill in here.
    {::query [:map
              [:source-table {:optional true :js/prop "source-table"}
               number?]
              [:source-query {:optional true :js/prop "source-query"}
               [:ref ::query]]
              [:order-by {:optional true :js/prop "order-by"} :any]]}}
   [:ref ::query]])

(def ParameterType
  "Malli schema for a ParameterType field."
  string?)

(def TemplateTag
  "Malli schema for a native query's template tag."
  [:map
   [:id string?]
   [:name string?]
   [:display-name {:js/prop "display-name"} string?]
   [:type [:enum "card" "text" "number" "date" "dimension" "snippet"]]
   [:dimension {:optional true} LocalFieldReference]
   [:widget-type {:optional true :js/prop "widget-type"} ParameterType] ;; FIXME
   [:required {:optional true} boolean?]
   [:default {:optional true} string?]
   [:card-id {:optional true :js/prop "card-id"} number?]
   [:snippet-id {:optional true :js/prop "snippet-id"} number?]
   [:snippet-name {:optional true :js/prop "snippet-name"} string?]])

(def NativeQuery
  "Malli schema for a native query."
  [:map
   [:query string?]
   [:template-tags {:optional true :js/prop "template-tags"}
    [:map-of string? TemplateTag]]])

(def DatasetQuery
  "Malli schema for `DatasetQuery`."
  [:map
   [:type [:enum "native" "query"]]
   [:database {:optional true} DatabaseId]
   [:native {:optional true} NativeQuery]
   [:query {:optional true} StructuredQuery]
   [:parameters {:optional true} [:sequential ParameterQueryObject]]])

(def VisualizationSettings
  "Malli schema for `VisualizationSettings` - a map of strings to opaque JS values."
  [:map-of string? :any])

(def ParameterId
  "Malli schema for a Parameter's ID: a string."
  :string)

(def Parameter
  "Malli schema for `Parameter`."
  [:map
   [:id ParameterId]
   [:name string?]
   [:display-name {:optional true :js/prop "display-name"} string?]
   [:type string?]
   [:slug string?]
   [:sectionId {:optional true :js-prep "sectionId"} string?]
   [:default {:optional true} :any]
   [:required {:optional true} boolean?]
   [:filtering-parameters {:optional true :js/prop "filteringParameters"} [:vector ParameterId]]
   [:is-multi-select {:optional true :js/prop "isMultiSelect"} boolean?]
   [:value {:optional true} :any]])

(def Card
  "Malli schema for a possibly-saved Card, with BE parts as optional."
  [:map
   [:dataset-query DatasetQuery]
   [:display string?]
   [:visualization-settings VisualizationSettings]
   [:parameters {:optional true} [:vector Parameter]]
   [:dashboard-id {:optional true :js/prop "dashboardId"} number?]
   [:dashcard-id  {:optional true :js/prop "dashcardId"}  number?]
   [:original-card-id {:optional true} number?]
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
   [:collection-id {:optional true} [:maybe number?]]
   [:collection-position {:optional true} [:maybe number?]]
   [:display-is-locked {:optional true :js/prop "displayIsLocked"} boolean?]
   [:parameter-usage-count {:optional true} number?]
   [:result-metadata {:optional true} :any]
   [:creator {:optional true}
    [:map
     [:id number?]
     [:common-name string?]
     [:first-name  [:maybe string?]]
     [:last-name   [:maybe string?]]
     [:email string?]
     [:last-login string?]
     [:date-joined string?]]]])

(def ParameterValue
  "Malli schema for `ParameterValue`."
  [:tuple [:or string? number? boolean? nil?]])

(def ParameterValues
  "Malli schema for `ParameterValues`."
  [:map
   [:values [:vector ParameterValue]]
   [:has-more-values boolean?]])

(def Question
  "Malli schema for `Question`."
  [:map
   [:card Card]
   [:metadata :any]
   [:parameter-values ParameterValues]])

(de/defn ^:export without-name-and-id :- Question
  "Removes the ID, name and description fields."
  [question :- Question]
  (update question :card dissoc :id :name :description))

(defn- transient-id? [id]
  (and id (string? id) (NaN? (u/parse-int id))))

(de/defn ^:export omit-transient-card-ids :- [:or Question :any]
  "Checks if the card's `:id` or `:original-card-id` are transient IDs, and removes them if so."
  [{{:keys [id original-card-id]} :card :as question} :- Question
   original :- :any]
  (let [id?               (transient-id? id)
        original-card-id? (transient-id? original-card-id)]
    (if (or id? original-card-id?)
      (update question :card
              #(cond-> %
                 id?               (dissoc :id)
                 original-card-id? (dissoc :original-card-id)))
      original)))

(de/def-getters-and-setters Question
  cache-ttl             [:card :cache-ttl]
  can-write             [:card :can-write]
  card                  [:card]
  card-id               [:card :id]
  card-parameters       [:card :parameters]
  collection-id         [:card :collection-id]
  collection-position   [:card :collection-position]
  creation-type         [:card :creation-type]
  dashboard-id          [:card :dashboard-id]
  dashcard-id           [:card :dashcard-id]
  dataset               [:card :dataset]
  dataset-query         [:card :dataset-query]
  dataset-query-type    [:card :dataset-query :type]
  description           [:card :description]
  display               [:card :display]
  display-name          [:card :name]
  display-is-locked     [:card :display-is-locked]
  last-edit-info        [:card :last-edit-info]
  last-query-start      [:card :last-query-start]
  metadata              [:metadata]
  moderation-reviews    [:card :moderation-reviews]
  parameter-values      [:parameter-values]
  parameter-usage-count [:card :parameter-usage-count]
  persisted             [:card :persisted]
  public-uuid           [:card :public-uuid]
  query                 [:card :dataset-query :query]
  result-metadata       [:card :result-metadata]
  settings              [:card :visualization-settings])

(de/defn ^:export setting :- :any
  "Fetches the opaque JS value of a given visualization setting."
  [question :- Question setting-key :- string? default-value :- :any]
  (get (settings question) setting-key default-value))

(def ^:private viz-converter
  #?(:cljs (converters/incoming VisualizationSettings)
     :clj  identity))

(de/defn ^:export merge-settings :- Question
  "Merges the incoming visualization settings with the existing map."
  [question :- Question new-settings :- VisualizationSettings]
  (update-in question [:card :visualization-settings] merge (viz-converter new-settings)))

(de/defn ^:export mark-dirty :- Question
  "Makes the current :id the new :original-card-id, then drops :id."
  [question :- Question]
  (update question :card
          (fn [card]
            (-> card
                (assoc :original-card-id (:id card))
                (dissoc :id)))))

(de/defn ^:export with-dashboard-props :- Question
  "Sets the :card's :dashboard-id and :dashcard-id."
  [question     :- Question
   dashboard-id :- [:maybe number?]
   dashcard-id  :- [:maybe number?]]
  (update question :card assoc :dashboard-id dashboard-id :dashcard-id dashcard-id))

(de/defn ^:export is-equal :- boolean?
  "Checks if this Question is equal to the provided one."
  [q1 :- Question q2 :- [:maybe Question] compare-results-metadata :- boolean?]
  (let [card-prep (if compare-results-metadata
                    identity
                    #(dissoc % :result-metadata))]
    (boolean (and q2
                  (= (card-id q1) (card-id q2))
                  (= (card-prep (:card q1)) (card-prep (:card q2)))
                  (= (:parameter-values q1) (:parameter-values q2))))))

#?(:cljs
   (def ^:export from-js
     "Converts a plain JS `QuestionContents` into a CLJS map."
     (converters/incoming Question)))
