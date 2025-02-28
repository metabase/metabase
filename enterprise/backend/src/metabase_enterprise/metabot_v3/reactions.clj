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

(defreaction :metabot.reaction/run-query
  [:map
   [:type [:= :metabot.reaction/run-query]]
   [:dataset_query :map]])

(defreaction :metabot.reaction/redirect
  [:map
   [:type [:= :metabot.reaction/redirect]]
   [:url :string]])
