(ns metabase-enterprise.metabot-v3.tools.invite-user
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.api.common :as api]
   [metabase.api.user :as api.user]
   [metabase.util.malli :as mu]))

(defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/invite-user
  [_tool-name _context]
  api/*is-superuser?*)

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/invite-user
  [_tool-name {:keys [email], :as _argument-map}]
  {:output (try (let [resp (api.user/invite-user {:email email})]
                  (json/generate-string (select-keys resp [:id :email])))
                (catch Exception e
                  (format "An exception occurred: %s" (ex-data e))))})
