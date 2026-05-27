(ns metabase-enterprise.data-app-demo.api
  "Proof-of-concept /api/ee/data-app-demo endpoint.

   Serves the data-app JS bundle the demo page at /data-app-demo evaluates
   inside a Near Membrane sandbox. The bundle is always proxied from the URL
   configured in the `data-app-demo-dev-bundle-url` setting; when that setting
   is blank, the endpoint returns 404 and the demo page renders an empty
   state telling the admin to set the URL."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.data-app-demo.settings :as data-app-demo.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private bundle-response-headers
  {"Content-Type"                 "application/javascript"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(defn- proxy-dev-bundle
  "Fetch the dev bundle from `url` and respond with its bytes. Bounded by
   timeouts and a max body size to avoid hanging on a misbehaving tunnel."
  [respond ^String url]
  (try
    (let [{:keys [status body]} (http/get url
                                          {:as                :byte-array
                                           :throw-exceptions? false
                                           :conn-timeout      3000
                                           :socket-timeout    10000
                                           :max-redirects     2})]
      (if (= 200 status)
        (respond {:status  200
                  :headers bundle-response-headers
                  :body    (java.io.ByteArrayInputStream. ^bytes body)})
        (do
          (log/warnf "Dev bundle proxy got HTTP %s from %s" status url)
          (respond {:status  502
                    :headers {"Content-Type" "application/json"}
                    :body    (format "{\"error\": \"Upstream returned %s\"}" status)}))))
    (catch Exception e
      (log/warnf e "Dev bundle proxy failed for %s" url)
      (respond {:status  502
                :headers {"Content-Type" "application/json"}
                :body    (format "{\"error\": %s}" (pr-str (ex-message e)))}))))

(api.macros/defendpoint :get "/bundle" :- :any
  "Serve the demo data-app JS bundle by proxying the dev URL configured in
   `data-app-demo-dev-bundle-url`. 404s when no URL is set."
  [_route-params _query-params _body _request respond raise]
  (try
    (api/check-superuser)
    (if-let [dev-url (some-> (data-app-demo.settings/data-app-demo-dev-bundle-url)
                             str/trim
                             not-empty)]
      (proxy-dev-bundle respond dev-url)
      (respond {:status  404
                :headers {"Content-Type" "application/json"}
                :body    "{\"error\": \"No dev bundle URL configured\"}"}))
    (catch Throwable e
      (raise e))))

(def routes
  "`/api/ee/data-app-demo` routes."
  (api.macros/ns-handler *ns* +auth))
