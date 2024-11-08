(ns metabase-enterprise.metabot-v3.tools.confirm-invite-user
  (:require [metabase-enterprise.metabot-v3.tools.registry :refer [deftool]]
            [metabase.api.common :as api]))

(deftool confirm-invite-user
  :is-applicable? (fn is-applicable? [_context]
                    api/*is-superuser?*)
  :requires-confirmation? true)
