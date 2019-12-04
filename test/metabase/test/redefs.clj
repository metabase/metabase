(ns metabase.test.redefs
  (:require [clojure.test :as t]
            [metabase.plugins.classloader :as classloader]
            [metabase.test.synchronize :as test.sync]
            [toucan.util.test :as tt]))

;; wrap `do-with-temp` so it initializes the DB before doing the other stuff it usually does
(when-not (::wrapped? (meta #'tt/do-with-temp))
  (alter-var-root #'tt/do-with-temp (fn [f]
                                      (fn [& args]
                                        (classloader/require 'metabase.test.initialize)
                                        ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
                                        (classloader/require 'metabase.test.util) ; so with-temp-defaults are loaded
                                        (apply f args))))
  (alter-meta! #'tt/do-with-temp assoc ::wrapped? true))

;; mark `expect-with-temp` as deprecated -- it's not needed for `deftest`-style tests
(alter-meta! #'tt/expect-with-temp assoc :deprecated true)

;; TODO - not a good long-term place to put this.
(defmethod t/assert-expr 're= [msg [_ pattern s]]
  `(let [pattern#  ~pattern
         s#        ~s
         matches?# (when s#
                     (re-matches pattern# s#))]
     (t/do-report
      {:type     (if matches?# :pass :fail)
       :message  ~msg
       :expected pattern#
       :actual   s#})))

(defonce orig-with-redefs (var-get #'with-redefs))

(def ^:macro with-redefs*
  (fn [&form &env bindings & body]
    `(test.sync/synchronized
       ~(apply orig-with-redefs &form &env bindings body))))

(alter-var-root #'with-redefs (constantly (var-get #'with-redefs*)))

(defonce orig-deftest (var-get #'t/deftest))

(def ^:macro deftest*
  (fn [&form &env name & body]
    (orig-deftest &form &env name (if (:pure (meta name))
                                    (do
                                      (printf "%s/%s is a PURE test. Nice!\n" (ns-name *ns*) name)
                                      `(do ~@body))
                                    `(test.sync/parallel ~@body)))))

(alter-var-root #'t/deftest (constantly (var-get #'deftest*)))
