(ns metabase.funnysql.toucan
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.funnysql.core :as funnysql]
   [methodical.core :as methodical]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.util :as t2.util]))

(methodical/defmethod t2.pipeline/compile [#_query-type :default
                                           #_model      :default
                                           #_query      clojure.lang.IPersistentMap]
  "Override default Honey SQL 2 backend; compile using Funny SQL instead."
  [query-type model honeysql]
  (let [sql-args (t2.util/try-with-error-context ["compile Honey SQL to SQL" {::honeysql honeysql}]
                   (funnysql/compile honeysql (app-db/db-type)))]
    (t2.pipeline/compile query-type model sql-args)))
