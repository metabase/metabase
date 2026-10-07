(ns metabase.util.api-error
  "Which parts of an exception's `ex-data` an API error response may send to the client.

  Like `:status-code`, `:response/keys` is a key the API error handling understands: the throw site lists its
  client-facing keys there and only those are sent. `(ex-info msg {:status-code 400, :card-id 1, :errors {...},
  :response/keys #{:errors}})` responds with `{:errors {...}}`. Everything else is server-side context (queries, ids,
  permissions) that stays out of the response, so each client-facing key is opted in rather than secrets being opted
  out. Keys keep their names, so code reading the ex-data is unaffected by what is listed."
  (:refer-clojure :exclude [ex-info]))

(defn extend-response-keys
  "Add `ks` to the `:response/keys` of `data`, the keys that are sent to the client. For data built up elsewhere, like
  ex-data being rethrown or data handed to another exception constructor.

    (transform-testing.errors/ex ::missing-inputs msg (api-error/extend-response-keys {:tables tables} :tables))"
  [data & ks]
  (cond-> data
    (seq ks) (update :response/keys (fnil into #{}) ks)))

(defn response-data
  "The client-facing part of an exception's `data`: the entries for its listed keys."
  [data]
  (select-keys data (:response/keys data)))

(defn ex-info
  "Like [[clojure.core/ex-info]], adding the `:response/keys` option to those of `data`. With a map literal, put
  `:response/keys` in it instead; this is for data built elsewhere, like ex-data being rethrown.

    (api-error/ex-info (ex-message e) (assoc (ex-data e) :status-code 400) e :response/keys #{:errors})"
  {:arglists '([msg data & {response-keys :response/keys}] [msg data cause & {response-keys :response/keys}])}
  [msg data & args]
  (let [[cause & opts]              (if (odd? (count args)) args (cons nil args))
        {response-keys :response/keys} opts]
    (when-not (or (nil? cause) (instance? #?(:clj Throwable :cljs js/Error) cause))
      (throw (clojure.core/ex-info "api-error/ex-info takes the client-facing keys as :response/keys"
                                   {:cause cause})))
    (clojure.core/ex-info msg (apply extend-response-keys data response-keys) cause)))

#?(:clj
   (defmacro exposing
     "Run `body`, rethrowing any `ExceptionInfo` it throws with `api-keys` added to its `:response/keys` (see
  [[extend-response-keys]]). For exceptions from code that cannot list its own client-facing keys, like the `throttle`
  library's `:errors`.

    (api-error/exposing #{:errors}
      (throttle/check login-throttler email))"
     {:style/indent 1}
     [api-keys & body]
     `(try
        ~@body
        (catch clojure.lang.ExceptionInfo e#
          (throw (if (every? (:response/keys (ex-data e#) #{}) ~api-keys)
                   e#
                   (clojure.core/ex-info (ex-message e#) (apply extend-response-keys (ex-data e#) ~api-keys) e#)))))))

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
