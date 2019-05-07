(ns metabase.query-processor.middleware.catch-exceptions-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]))

(defn- catch-exceptions
  ([qp]
   (catch-exceptions qp {}))
  ([qp query]
   ((catch-exceptions/catch-exceptions qp)
    query
    identity
    identity
    nil)))

;; No Exception -- should return response as-is
(expect
  {}
  (catch-exceptions
   (fn [query respond _ _]
     (respond query))))

;; if the QP throws an Exception (synchronously), should format the response appropriately
(expect
  {:status     :failed
   :class      java.lang.Exception
   :error      "Something went wrong"
   :stacktrace true
   :query      {}}
  (-> (catch-exceptions
       (fn [& _]
         (throw (Exception. "Something went wrong"))))
      (update :stacktrace boolean)))

;; if an Exception is returned asynchronously by `raise`, should format it the same way
(expect
  {:status     :failed
   :class      java.lang.Exception
   :error      "Something went wrong"
   :stacktrace true
   :query      {}}
  (-> (catch-exceptions
       (fn [_ _ raise _]
         (raise (Exception. "Something went wrong"))))
      (update :stacktrace boolean)))
