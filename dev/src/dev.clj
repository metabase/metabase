(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require [metabase
             [core :as mbc]
             [db :as mdb]
             [handler :as handler]
             [plugins :as pluguns]
             [server :as server]
             [util :as u]]
            [metabase.api.common :as api-common]
            [metabase.models.interface :as mi]
            [metabase.test.util] ;; extensions
            [toucan.db :as tdb]
            [toucan.util.test :as tt]))

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

(defn run-tests*
  [& namespaces]
  (let [namespaces (map the-ns namespaces)]
    (doseq [a-namespace namespaces]
      (ns-unmap-all a-namespace)
      (require (ns-name a-namespace) :reload))
    (expectations/run-tests namespaces)))

(defmacro run-tests
  "Run expectations test in `namespaces`. With no args, runs tests in the current namespace. Clears all interned vars in
  the namespace, reloads it, and runs tests. `namespaces` may be either actual namespace objects or their symbol
  names.

  (run-tests)        ; current-namespace
  (run-tests *ns*)   ; current-namespace
  (run-tests 'my-ns) ; run tests in my-ns"
  ([]
   `(run-tests* '~(ns-name *ns*)))
  ([& namespaces]
   `(run-tests* ~@(map #(list 'quote (ns-name (the-ns (eval %)))) namespaces))))

(defmacro require-model
  "Rather than requiring all models inn the ns declaration, make it easy to require the ones you need for your current session"
  [model-sym]
  `(require [(symbol (str "metabase.models." (quote ~model-sym))) :as (quote ~model-sym)]))

(defmacro with-permissions
  [permissions & body]
  `(binding [api-common/*current-user-permissions-set* (delay ~permissions)]
     ~@body))
