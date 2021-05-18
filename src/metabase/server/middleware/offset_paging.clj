(ns metabase.server.middleware.offset-paging
  (:require [medley.core :as m]
            [metabase.server.middleware.security :as mw.security ]
            [metabase.util.i18n :refer [tru]]))

(def ^:private default-limit 50)

(def ^:dynamic *limit* default-limit)

(def ^:dynamic *offset* 0)

(def ^:dynamic *paged?* false)

(defn- offset-paged? [{{:strs [page limit]} :query-params}]
  (or page limit))

(defn- parse-paging-params [{{:strs [limit offset]} :query-params}]
  (let [limit  (or (some-> limit Integer/parseUnsignedInt)
		   default-limit)
	offset (or (some-> offset Integer/parseUnsignedInt)
		   0)]
    {:limit limit, :offset offset}))

(defn- with-paging-params [request {:keys [limit offset]}]
  (-> request
      (assoc ::limit limit, ::offset offset)
      (m/dissoc-in [:query-params "offset"])
      (m/dissoc-in [:query-params "limit"])
      (m/dissoc-in [:params :offset])
      (m/dissoc-in [:params :limit])))

(defn handle-paging
  [handler]
  (fn [request respond raise]
    (if-not (offset-paged? request)
      (handler request respond raise)
      (let [paging-params (try
                            (parse-paging-params request)
                            (catch Throwable e
                              e))]
        (if (instance? Throwable paging-params)
          (let [^Throwable e paging-params]
            (respond {:status  400
                      :headers (mw.security/security-headers)
                      :body    (merge
                                (Throwable->map e)
                                {:message (tru "Error parsing paging parameters: {0}" (ex-message e))})}))
          (let [{:keys [limit offset]} paging-params
                request                (with-paging-params request paging-params)]
            (binding [*limit*         limit
                      *offset*        offset
                      *paged?* true]
              (handler request respond raise))))))))
