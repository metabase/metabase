(ns metabase-enterprise.metabot-v3.reactions
  "Schemas for various reactions.

  All reactions must have a `:type` with the namespace `metabot.reaction`, but declaring a schema for it is optional.
  If you want to declare a schema, you can use [[defreaction]]."
  (:require
   [clojure.spec.alpha :as s]
   [malli.core :as mc]
   [metabase.util :as u]
   [metabase.util.log :as log]
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
(defmacro defreaction
  "Declare a new reaction type and the schema for it.

  The schema name matches the reaction-name."
  [reaction-name schema]
  `(do
     (derive ~reaction-name :metabot/registered-action)
     (mr/def ~reaction-name
       ~schema)))

(s/fdef defreaction
  :args (s/cat :tool-name (and qualified-keyword?
                               #(= (namespace %) "metabot.reaction"))
               :schema    any?)
  :ret  any?)

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
