(ns metabase.api.telegram
    "/api/telegram endpoints"
    (:require [compojure.core :refer [PUT]]
              [schema.core :as s]
              [metabase.api.common :refer :all]
              [metabase.config :as config]
              [metabase.integrations.telegram :as telegram]
              [metabase.models.setting :as setting]
              [metabase.util.schema :as su]))

(defendpoint PUT "/settings"
  "Update Telegram related settings. You must be a superuser to do this."
  [:as {{telegram-token :telegram-token, :as telegram-settings} :body}]
  {telegram-token   (s/maybe su/NonBlankString)}
  (check-superuser)
  (if-not telegram-token
          (setting/set-many! {:telegram-token nil})
          (try
            ;; just check that getMe doesn't throw an exception (a.k.a. that the token works)
            (when-not config/is-test?
                      (telegram/GET :getMe, :exclude_archived 1, :token telegram-token))
            (setting/set-many! telegram-settings)
            {:ok true}
            (catch clojure.lang.ExceptionInfo info
              {:status 400, :body (ex-data info)}))))

(define-routes)
