(ns metabase.api.metastore
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.public-settings.metastore :as metastore]))

(api/defendpoint GET "/token/status"
  "Fetch info about the current MetaStore premium features token including whether it is `valid`, a `trial` token, its
  `features`, and when it is `valid_thru`."
  []
  (metastore/fetch-token-status (api/check-404 (metastore/premium-embedding-token))))

(api/define-routes api/+check-superuser)
