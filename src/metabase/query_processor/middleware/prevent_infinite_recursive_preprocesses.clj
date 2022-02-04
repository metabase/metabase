(ns metabase.query-processor.middleware.prevent-infinite-recursive-preprocesses
  (:require [clojure.tools.logging :as log]
            [metabase.query-processor.error-type :as error-type]
            [metabase.util.i18n :refer [tru]]))

(def ^:private ^:dynamic *preprocessing-level* 1)

(def ^:private ^:const max-preprocessing-level 20)

(defn prevent-infinite-recursive-preprocesses
  "QP around-middleware only used for preprocessing queries with [[metabase.query-processor/preprocess]]. Prevent
  infinite recursive calls to `preprocess`."
  [qp]
  (fn [query rff context]
    (binding [*preprocessing-level* (inc *preprocessing-level*)]
      ;; record the number of recursive preprocesses taking place to prevent infinite preprocessing loops.
      (log/tracef "*preprocessing-level*: %d" *preprocessing-level*)
      (when (>= *preprocessing-level* max-preprocessing-level)
        (throw (ex-info (str (tru "Infinite loop detected: recursively preprocessed query {0} times."
                                  max-preprocessing-level))
                        {:type error-type/qp})))
      (qp query rff context))))
