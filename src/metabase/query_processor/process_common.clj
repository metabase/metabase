(ns metabase.query-processor.process-common
  (:require [metabase.query-processor.middleware.resolve-database-and-driver :as resolve-database-and-driver]
            [metabase.query-processor.store :as qp.store]))

(defn do-ensure-store-and-driver [query thunk]
  (qp.store/do-with-store
   (^:once fn* []
    (resolve-database-and-driver/do-with-resolved-database-and-driver
     query
     thunk))))

(defmacro ensure-store-and-driver {:style/indent 1} [query body & more]
  `(do-ensure-store-and-driver ~query (^:once fn* [] ~body ~@more)))
