(ns metabase.server.middleware.offset-paging
  "This is a middleware that binds the dynamic variables `*limit*` and `*offset*`, saving individual endpoints from
  repeating the same param-parsing code. The query params are, of course, called `limit` and `offset`.

  Note that this merely parses them and passes them on: the mechanics of paginating the response based on the limit
  and offset still needs to be handled downstream, though if handling it in SQL is unavailable it could be done with
  this namespace's `page-result` fn."
  (:require
   [medley.core :as m]
   [metabase.request.core :as request]))

(set! *warn-on-reflection* true)

(def ^:private default-limit 50)
(def ^:private default-offset 0)

(defn- parse-paging-params [{{:strs [limit offset]} :query-params}]
  (let [limit  (some-> limit parse-long)
        offset (some-> offset parse-long)]
    (when (or limit offset)
      {:limit (or limit default-limit), :offset (or offset default-offset)})))

(defn- with-paging-params [request {:keys [limit offset]}]
  (-> request
      (assoc ::limit limit, ::offset offset)
      (m/dissoc-in [:query-params "offset"])
      (m/dissoc-in [:query-params "limit"])
      (m/dissoc-in [:params :offset])
      (m/dissoc-in [:params :limit])))

(defn handle-paging
  "Limit offset paging.
  This has many downsides but many upsides, chief among them at-will random paging.
  (it isn't stable with respect to underlying data changing, though)"
  [handler]
  (fn [request respond raise]
    (if-let [{:keys [limit offset] :as paging-params} (parse-paging-params request)]
      (request/with-limit-and-offset
        limit offset
        (handler (with-paging-params request paging-params) respond raise))
      (handler request respond raise))))
