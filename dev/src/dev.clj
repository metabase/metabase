(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require [clojure.set :as set]
            [metabase
             [core :as mbc]
             [db :as mdb]
             [handler :as handler]
             [plugins :as pluguns]
             [query-processor-test :as qp.test]
             [server :as server]
             [util :as u]]
            [metabase.api.common :as api-common]
            [metabase.test.data.env :as tx.env]))

(defn init!
  []
  (mbc/init!))

(defn start!
  []
  (metabase.server/start-web-server! #'metabase.handler/app)
  (metabase.db/setup-db!)
  (metabase.plugins/load-plugins!)
  (metabase.core.initialization-status/set-complete!))

(defn stop!
  []
  (metabase.server/stop-web-server!))

(defn restart!
  []
  (stop!)
  (start!))

(defn ns-unmap-all
  "Unmap all interned vars in a namespace. Reset the namespace to a blank slate! Perfect for when you rename everything
  and want to make sure you didn't miss a reference or when you redefine a multimethod.

    (ns-unmap-all *ns*)"
  [a-namespace]
  (doseq [[symb] (ns-interns a-namespace)]
    (ns-unmap a-namespace symb)))

(defn ns-unalias-all
  "Remove all aliases for other namespaces from the current namespace.

    (ns-unalias-all *ns*)"
  [a-namespace]
  (doseq [[symb] (ns-aliases a-namespace)]
    (ns-unalias a-namespace symb)))

(defmacro require-model
  "Rather than requiring all models inn the ns declaration, make it easy to require the ones you need for your current
  session"
  [model-sym]
  `(require [(symbol (str "metabase.models." (quote ~model-sym))) :as (quote ~model-sym)]))

(defmacro with-permissions
  [permissions & body]
  `(binding [api-common/*current-user-permissions-set* (delay ~permissions)]
     ~@body))

(defn do-with-test-drivers [test-drivers thunk]
  {:pre [((some-fn sequential? set?) test-drivers)]}
  (with-redefs [tx.env/test-drivers            (atom (set test-drivers))
                qp.test/non-timeseries-drivers (atom (set/difference
                                                      (set test-drivers)
                                                      (var-get #'qp.test/timeseries-drivers)))]
    (thunk)))

(defmacro with-test-drivers
  "Temporarily change the drivers that Metabase tests will run against as if you had set the `DRIVERS` env var.

    ;; my-test will run against any non-timeseries driver (i.e., anything except for Druid) that is listed in the
    ;; `DRIVERS` env var
    (deftest my-test
      (datasets/test-drivers @qp.test/non-timeseries-drivers
        ...))

    ;; Run `my-test` against H2 and Postgres regardless of what's in the `DRIVERS` env var
    (dev/with-test-drivers #{:h2 :postgres}
      (my-test))"
  [test-driver-or-drivers & body]
  `(do-with-test-drivers ~(u/one-or-many test-driver-or-drivers) (fn [] ~@body)))
