(ns metabase.app-db.toucan2
  "Toucan 2 integration helpers for the application database."
  (:require
   [toucan2.honeysql2 :as t2.honeysql]))

(defmacro with-params
  "Evaluate `body` with `params` available to Honey SQL `[:param k]` placeholders in every Toucan 2 query compiled
  inside it. Nesting replaces `params`, so only the innermost call's params are visible to `body`."
  {:style/indent 1}
  [params & body]
  `(binding [t2.honeysql/*options* (assoc t2.honeysql/*options* :params ~params)]
     ~@body))
