(ns metabase.util.api-error
  "Which parts of an exception's `ex-data` an API error response may send to the client.

  The throw site lists its client-facing keys under `::keys`; only those are sent. `{:status-code 400, :card-id 1,
  :errors {...}, ::keys #{:errors}}` responds with `{:errors {...}}`. Everything else is server-side context (queries,
  ids, permissions) that stays out of the response, so each client-facing key is opted in rather than secrets being
  opted out. Keys keep their names, so code reading the ex-data is unaffected by what is listed."
  (:refer-clojure :exclude [ex-info]))

(defn expose
  "Add `ks` to the keys of `data` that are sent to the client. A throw site should use [[ex-info]]; this is for data
  handed to something else that builds the exception, like another exception constructor.

    (transform-testing.errors/ex ::missing-inputs msg (api-error/expose {:tables tables} :tables))"
  [data & ks]
  (cond-> data
    (seq ks) (update ::keys (fnil into #{}) ks)))

(defn response-data
  "The client-facing part of an exception's `data`: the entries for its listed keys."
  [data]
  (select-keys data (::keys data)))

(defn- check-api-keys
  "`api-keys` is the third argument of [[ex-info]], where [[clojure.core/ex-info]] takes the cause: fail clearly when a
  cause is passed there."
  [api-keys]
  (when-not (or (nil? api-keys) (coll? api-keys))
    (throw (clojure.core/ex-info "api-error/ex-info takes the client-facing keys before the cause"
                                 {:api-keys api-keys})))
  api-keys)

(defn ex-info
  "Like [[clojure.core/ex-info]], with `api-keys`, the keys of `data` that are sent to the client.

    (api-error/ex-info (tru \"Invalid card\") {:status-code 400, :card-id id, :errors {:card_id \"...\"}} #{:errors})"
  ([msg data api-keys]
   (clojure.core/ex-info msg (apply expose data (check-api-keys api-keys))))
  ([msg data api-keys cause]
   (clojure.core/ex-info msg (apply expose data (check-api-keys api-keys)) cause)))

#?(:clj
   (defmacro exposing
     "Run `body`, rethrowing any `ExceptionInfo` it throws with `api-keys` of its `ex-data` exposed (see [[expose]]). For
  exceptions from code that cannot list its own client-facing keys, like the `throttle` library's `:errors`.

    (api-error/exposing #{:errors}
      (throttle/check login-throttler email))"
     {:style/indent 1}
     [api-keys & body]
     `(try
        ~@body
        (catch clojure.lang.ExceptionInfo e#
          (throw (if (every? (::keys (ex-data e#) #{}) ~api-keys)
                   e#
                   (clojure.core/ex-info (ex-message e#) (apply expose (ex-data e#) ~api-keys) e#)))))))

#?(:clj
   (defn throwable->map
     "[[clojure.core/Throwable->map]] with each `:data` (the root cause's, and every `:via` entry's) reduced to its
  [[response-data]] and `:status-code`, dropping it when there is neither."
     [^Throwable e]
     (let [filter-data (fn [x]
                         (let [data (merge (response-data (:data x))
                                           (select-keys (:data x) [:status-code]))]
                           (if (seq data)
                             (assoc x :data data)
                             (dissoc x :data))))]
       (-> (Throwable->map e)
           filter-data
           (update :via #(mapv filter-data %))))))
