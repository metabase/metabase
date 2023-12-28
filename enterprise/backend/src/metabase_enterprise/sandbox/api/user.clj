(ns metabase-enterprise.sandbox.api.user
  "Endpoint(s)for setting user attributes."
  (:require
   [clojure.set :as set]
   [compojure.core :refer [GET PUT]]
   [metabase.api.common :as api]
   [metabase.models.user :refer [User]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private UserAttributes
  (mu/with-api-error-message
    [:map-of
     :keyword
     :any]
    (deferred-tru "value must be a valid user attributes map (name -> value)")))

;; TODO - not sure we need this endpoint now that we're just letting you edit from the regular `PUT /api/user/:id
;; endpoint
(api/defendpoint PUT "/:id/attributes"
  "Update the `login_attributes` for a User."
  [id :as {{:keys [login_attributes]} :body}]
  {id ms/PositiveInt
   login_attributes [:maybe UserAttributes]}
  (api/check-404 (t2/select-one User :id id))
  (pos? (t2/update! User id {:login_attributes login_attributes})))

(api/defendpoint GET "/attributes"
  "Fetch a list of possible keys for User `login_attributes`. This just looks at keys that have already been set for
  existing Users and returns those. "
  []
  (->>
   ;; look at the `login_attributes` for the first 1000 users that have them set. Then make a set of the keys
   (for [login-attributes (t2/select-fn-set :login_attributes User :login_attributes [:not= nil] {:limit 1000})
         :when (seq login-attributes)]
     (set (keys login-attributes)))
   ;; combine all the sets of attribute keys into a single set
   (reduce set/union #{})))

(api/define-routes api/+check-superuser)
