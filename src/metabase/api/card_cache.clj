(ns metabase.api.card-cache
  "/api/card_cache endpoints"
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [PUT]]
            [metabase.api.common :refer :all]
            [metabase.card-cache :as card-cache]
            [metabase.models.setting :as setting]))

(defendpoint PUT "/settings"
             "Update Cache related settings. You must be a superuser to do this."
             [:as {{:as settings} :body}]
             (check-superuser)
             (let [cache-settings (select-keys settings card-cache/all-settings)]
               (try
                 (log/info "Persisting cache settings " cache-settings)
                 (setting/set-many! cache-settings)
                 {:ok true}
                 (catch clojure.lang.ExceptionInfo info
                   {:status 400, :body (ex-data info)}))))

(define-routes)
