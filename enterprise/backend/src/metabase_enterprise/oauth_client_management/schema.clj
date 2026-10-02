(ns metabase-enterprise.oauth-client-management.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::client-status
  "Which registered clients a query is about: the `active` ones (the default), the `revoked` ones, or `all` of them.
  A client is revoked exactly when it carries a `revoked_at`."
  [:enum :active :revoked :all])

(mr/def ::client-filters
  "The filters [[metabase-enterprise.oauth-client-management.query/client-where]] takes. `status` defaults to
  `:active`."
  [:map {:closed true}
   [:status {:optional true} [:maybe ::client-status]]
   [:ids    {:optional true} [:maybe [:sequential :string]]]])
