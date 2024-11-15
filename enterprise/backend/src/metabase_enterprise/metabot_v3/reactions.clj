(ns metabase-enterprise.metabot-v3.reactions
  "Schemas for various reactions.

  All reactions must have a `:type` with the namespace `metabot.reaction`, but declaring a schema for it is optional.
  If you want to declare a schema, you can use [[defreaction]]."
  (:require
   [malli.core :as mc]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::reaction-type
  "A MetaBot v3 reaction type keyword e.g. `:metabot.reaction/message`"
  [:fn
   {:error/message "Reaction type must be a kebab-case keyword starting whose namespace is `metabot.reaction`."}
   (fn [x]
     (and (qualified-keyword? x)
          (= (u/->kebab-case-en (u/qualified-name x)) (u/qualified-name x))
          (= (namespace x) "metabot.reaction")))])

;;; TODO -- need Kondo hook that registers the keyword
(mu/defn defreaction
  "Declare a new reaction type and the schema for it.

  The schema name matches the reaction-name."
  [reaction-name :- ::reaction-type
   schema]
  (derive reaction-name :metabot/registered-action)
  (mr/register! reaction-name schema))

(defn- known-reaction-types
  "Reaction types with schemas that were declared with [[defreaction]]."
  []
  (descendants :metabot/registered-action))

;;; this is just a placeholder so LSP can register the place it lives for jump-to-definition functionality. Actual
;;; schema gets created below by [[reaction-schema]] and [[update-reaction-schema!]]
(mr/def ::reaction any?)

(defn- reaction-schema
  "Build the schema for `::reaction`."
  []
  [:and
   [:map
    [:type ::reaction-type]]
   (into [:multi
          {:dispatch :type}
          [::mc/default :any]]
         (map (fn [reaction-type]
                [reaction-type reaction-type]))
         (known-reaction-types))])

(defn- update-reaction-schema! []
  (log/debug "Updating reaction schema")
  (mr/register! :metabase-enterprise.metabot-v3.reactions/reaction (reaction-schema)))

(update-reaction-schema!)

;;; when the descendants of `:metabot/registered-action` change update the `::reaction` schema
(add-watch #'clojure.core/global-hierarchy
           ::update-reaction-schema
           (fn [_key _ref old-hierarchy new-hierarchy]
             (when-not (= (descendants old-hierarchy :metabot/registered-action)
                          (descendants new-hierarchy :metabot/registered-action))
               (update-reaction-schema!))))

;;;;
;;;; Reaction definitions
;;;;

(defreaction :metabot.reaction/message
  [:map
   [:type    [:= :metabot.reaction/message]]
   [:message :string]])

(defreaction :metabot.reaction/user-invite-sent
  [:map
   [:type  [:= :metabot.reaction/user-invite-sent]]
   [:email :string]])

(defreaction :metabot.reaction/your-favorite
  [:map
   [:type [:= :metabot.reaction/your-favorite]]])

(defreaction :metabot.reaction/apply-visualizations
  [:map
   [:type           [:= :metabot.reaction/apply-visualizations]]
   [:display        [:maybe [:enum "pie" "table" "bar" "line" "row" "area" "scalar"]]]
   [:filters        [:maybe [:vector [:map
                                      [:field :string]
                                      [:operator [:enum "<" "<=" ">" ">=" "=" "!=" "contains" "does-not-contain" "starts-with"]]
                                      [:value [:or number? :string]]]]]]
   [:summarizations [:maybe [:vector [:map
                                      [:fieldName {:optional true} [:maybe :string]]
                                      [:metrics [:enum "sum" "count" "avg"]]]]]]
   [:groups         [:maybe [:vector [:map
                                      [:fieldName [:maybe :string]]
                                      [:granularity [:maybe [:enum "day" "week" "month" "year"]]]]]]]])

(defreaction :metabot.reaction/change-table-visualization-settings
  [:map
   [:type [:= :metabot.reaction/change-table-visualization-settings]]
   [:visible-columns [:vector :string]]])

(defreaction :metabot.reaction/change-display-type
  [:map
   [:type [:= :metabot.reaction/change-display-type]]
   [:display-type [:enum "pie" "table" "bar" "line" "row" "area" "scalar"]]])

(defreaction :metabot.reaction/goto-question
  [:map
   [:type [:= :metabot.reaction/goto-question]]
   [:question_id integer?]])

(defreaction :metabot.reaction/confirmation
  [:map
   [:type [:= :metabot.reaction/confirmation]]
   [:description :string]
   [:options [:map-of :keyword [:vector [:ref ::reaction]]]]])

(defreaction :metabot.reaction/api-call
  [:map
   [:type [:= :metabot.reaction/api-call]]
   [:api-call [:map
               [:method :string]
               [:url :string]
               [:body [:map-of :any :any]]]]])

(defreaction :metabot.reaction/writeback
  [:map
   [:type [:= :metabot.reaction/writeback]]
   [:message :string]])

(defreaction :metabot.reaction/run-query
  [:map
   [:type [:= :metabot.reaction/run-query]]
   [:dataset_query :map]])

(defreaction :metabot.reaction/change-series-settings
  [:map
   [:type [:= :metabot.reaction/change-series-settings]]
   [:series_settings [:vector [:map
                               [:key :string]
                               [:title {:optional true} [:maybe :string]]
                               [:color {:optional true} [:maybe :string]]
                               [:show_series_values {:optional true} [:maybe boolean?]]
                               [:line.size {:optional true} [:maybe [:enum "S" "M" "L"]]]
                               [:line.style {:optional true} [:maybe [:enum "solid" "dashed" "dotted"]]]
                               [:line.interpolate {:optional true} [:maybe [:enum "linear" "cardinal" "step-after"]]]
                               [:line.marker_enabled {:optional true} [:maybe boolean?]]
                               [:line.missing {:optional true} [:maybe [:enum "none" "zero" "interpolate"]]]
                               [:axis {:optional true} [:maybe [:enum "left" "right"]]]]]]])

(defreaction :metabot.reaction/change-column-settings
  [:map
   [:type [:= :metabot.reaction/change-column-settings]]
   [:column_settings [:vector [:map
                               [:key :string]
                               [:column_title {:optional true} [:maybe :string]]
                               [:date_abbreviate {:optional true} [:maybe boolean?]]
                               [:date_format {:optional true} [:maybe :string]]
                               [:date_separator {:optional true} [:maybe [:enum "/" "-" "."]]]
                               [:date_style {:optional true} [:maybe [:enum
                                                                      "MMMM D, YYYY"
                                                                      "D MMMM, YYYY"
                                                                      "dddd, MMMM D, YYYY"
                                                                      "M/D/YYYY"
                                                                      "D/M/YYYY"
                                                                      "YYYY/M/D"]]]
                               [:decimals {:optional true} [:maybe :int]]
                               [:link_text {:optional true} [:maybe :string]]
                               [:link_url {:optional true} [:maybe :string]]
                               [:number_separators {:optional true} [:maybe :string]]
                               [:number_style {:optional true} [:maybe :string]]
                               [:prefix {:optional true} [:maybe :string]]
                               [:show_mini_bar {:optional true} [:maybe boolean?]]
                               [:suffix {:optional true} [:maybe :string]]
                               [:view_as {:optional true} [:maybe [:enum "link" "email_link" "image" "auto"]]]]]]])

(defreaction :metabot.reaction/change-chart-appearance
  [:map
   [:type [:= :metabot.reaction/change-chart-appearance]]])
