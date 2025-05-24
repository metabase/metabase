(ns metabase.content-translation.api
  (:require
   [clojure.data.csv :as csv]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [ring.util.response :as resp]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/dictionary"
  "Provides translations of user-generated content. This is a public route so that logged-out viewers of static-embedded questions and dashboards can retrieve translations"
  ;; TODO: Secure this route against shenanigans
  [_route-params query-params _body]
  (if (premium-features/enable-content-translation?)
    (let [locale (:locale query-params)]
      (if locale
        {:data (t2/select :model/ContentTranslation :locale locale)}
        {:data (t2/select :model/ContentTranslation)}))
    (throw (ex-info "Content translation is not enabled" {:status-code 400}))))

(api.macros/defendpoint :post "/download"
  [_ _ _]
  (if (premium-features/enable-content-translation?)

    (let [sw (java.io.StringWriter.)
          cols [:locale :msgid :msgstr]
          csv (with-open [w (java.io.StringWriter.)]
                (csv/write-csv w (into [(map name cols)] (map (fn [row]
                                                     (map row cols)))
                                       (t2/select :model/ContentTranslation)))
                (str w))
          safe-filename "download.csv"]
      (-> (resp/response csv)
          (resp/header "Content-Type" "text/csv; charset=utf-8")
          (resp/header "Content-Disposition" (str "attachment; filename=\"" safe-filename "\""))
          (resp/header "Cache-Control" "no-cache, no-store, must-revalidate")
          (resp/header "Pragma" "no-cache")
          (resp/header "Expires" "0")))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/content-translation-dictionary` routes"
  (api.macros/ns-handler *ns*))
