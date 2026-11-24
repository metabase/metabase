(ns metabase.server.middleware.preview
  "Ring middleware that confines a request carrying a preview token (see [[metabase.server.middleware.session]]) to
  reading, and refuses a token that is no live preview's."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private reading-methods #{:get :head :options})

(def ^:private reading-post-routes
  "The POST routes that only read: they run a query, a saved question or a dashboard card as the current user, download
  its result, or load filter values. Any other POST is a write, and a preview refuses it."
  (mapv #(re-pattern (str "^" % "$"))
        ["/api/dataset"
         "/api/dataset/(?:csv|json|xlsx)"
         "/api/dataset/native"
         "/api/dataset/pivot"
         "/api/dataset/query_metadata"
         "/api/dataset/parameter/values"
         "/api/dataset/parameter/search/[^/]+"
         "/api/dataset/parameter/remapping"
         "/api/card/[^/]+/query"
         "/api/card/[^/]+/query/(?:csv|json|xlsx)"
         "/api/card/pivot/[^/]+/query"
         "/api/dashboard/[^/]+/dashcard/[^/]+/card/[^/]+/query"
         "/api/dashboard/[^/]+/dashcard/[^/]+/card/[^/]+/query/(?:csv|json|xlsx)"
         "/api/dashboard/pivot/[^/]+/dashcard/[^/]+/card/[^/]+/query"]))

(defn- reading-request?
  [{:keys [request-method uri]}]
  (or (contains? reading-methods request-method)
      (and (= :post request-method)
           (boolean (some #(re-matches % (str/replace (or uri "") #"/+$" "")) reading-post-routes)))))

(defn refuse-unless-reading
  "Middleware that refuses a request whose preview token is not a live preview's with a 401, and a request of a live
  preview that isn't a read with a 403 `preview-read-only`. Other requests pass untouched."
  [handler]
  (fn [{:keys [previewing-admin-id preview-token-refused?] :as request} respond raise]
    (cond
      preview-token-refused?
      (raise (ex-info (str (tru "The preview has ended or its token is invalid."))
                      {:status-code 401, :error-code "preview-token-invalid"}))

      (and previewing-admin-id (not (reading-request? request)))
      (raise (ex-info (str (tru "A preview is read-only."))
                      {:status-code 403, :error-code "preview-read-only"}))

      :else
      (handler request respond raise))))
