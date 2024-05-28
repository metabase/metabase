(ns metabase.server.middleware.memo
  "Allow memoizing the results of a function for a single request's lifespan.")

(def ^:dynamic *memoize-per-request-middleware*
  "Bound to an atom containing memoized results for the current request."
  nil)

(defn memoize-for-request
  "Given a function, returns a version of the function that will be memoized for a particular request, when used with
  the `memoize-per-request-middleware` middleware."
  [f]
  (fn [& args]
    (if-not (isa? *memoize-per-request-middleware* clojure.lang.Atom)
      (apply f args)
      (let [key (conj args f)]
        (if-let [e (find @*memoize-per-request-middleware* key)]
          (val e)
          (let [ret (apply f args)]
            (swap! *memoize-per-request-middleware* assoc key ret)
            ret))))))

(defn memoize-per-request-middleware
  "Ring middleware that allows us to memoize values for the duration of the current request."
  [handler]
  (fn [request respond raise]
    (binding [*memoize-per-request-middleware* (atom {})]
      (handler request respond raise))))
