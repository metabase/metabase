(ns metabase.actions-rest.template-api
  "`/api/action-template/` endpoints."
  (:require
   [metabase.actions.core :as actions]
   [metabase.actions.schema :as actions.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/" :- [:sequential ::actions.schema/action-template-category]
  "The built-in templates for new secrets and HTTP actions, by service. Superusers only."
  []
  (api/check-superuser)
  (actions/action-template-categories))
