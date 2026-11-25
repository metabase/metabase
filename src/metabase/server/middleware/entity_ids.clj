(ns metabase.server.middleware.entity-ids
  "The `X-Metabase-Ids: entity` request header, which asks for a response that names rows by their entity ids and
  natural keys instead of numeric ids (see [[metabase.eid-translation.core/->entity-ids]]), and lets the request body
  name them so too. A client working across instances, such as one and its git-sync restore, compares such responses
  as they are, and writes one back to the other."
  (:require
   [metabase.api.common :as api]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- entity-ids-requested?
  "Whether `request` asks for entity ids, and its caller is a superuser. The refs of the rows a response references
  name rows the caller may not otherwise see, such as Users by their emails and Tables by their Database's name, so
  any other caller, an anonymous one of a public link or an embed too, gets the response as it is."
  [request]
  (and api/*is-superuser?*
       (= "entity" (some-> (get-in request [:headers "x-metabase-ids"]) u/lower-case-en))))

(defn- rewrite-response
  "`response` with its body named by entity ids when it is a successful response of rows, as maps or a sequence of
  them. A streaming response, a query's results, is left as it is."
  [{:keys [status body] :as response}]
  (if (and (map? response)
           (or (nil? status) (<= 200 status 299))
           (or (map? body) (sequential? body)))
    (assoc response :body (eid-translation/->entity-ids body))
    response))

(defn wrap-entity-ids
  "Middleware that rewrites the body of the response to a request with the `X-Metabase-Ids: entity` header so that it
  names rows by their entity ids and natural keys. It runs inside the JSON middleware, which serializes the body it
  returns."
  [handler]
  (fn [request respond raise]
    (if (entity-ids-requested? request)
      ;; the request is in entity id form too: its body may name rows by refs (see
      ;; [[eid-translation/do-with-entity-ids]]), which the handler decodes while this call runs
      (eid-translation/do-with-entity-ids
       #(handler request
                 (fn [response]
                   ;; rewrite first, so a failure of `respond` itself is not raised a second time
                   (let [{:keys [rewritten error]} (try
                                                     {:rewritten (rewrite-response response)}
                                                     (catch Throwable e
                                                       {:error e}))]
                     (if error
                       (raise error)
                       (respond rewritten))))
                 raise))
      (handler request respond raise))))
