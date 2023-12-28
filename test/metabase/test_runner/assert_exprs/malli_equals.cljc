(ns metabase.test-runner.assert-exprs.malli-equals
  (:require
   [clojure.test :as t]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util :as u])
  #?(:cljs
     (:require-macros [metabase.test-runner.assert-exprs.malli-equals])))

(defn malli=-report [message schema actuals]
  (doseq [actual actuals]
    (t/testing (str \newline (u/pprint-to-str actual))
      (let [error (me/humanize (mc/explain schema actual))]
        (t/do-report
         {:type     (if error :fail :pass)
          :message  message
          :expected schema
          :actual   actual
          :diffs    [[actual [error nil]]]})))))

#?(:clj
   (do
     ;; Clojure for Clojure usage
     (defmethod t/assert-expr 'malli=
       [message [_ schema & actuals]]
       `(malli=-report ~message ~schema ~(vec actuals)))

     ;; Clojure doing macroexpansion for ClojureScript usage.
     (when-let [assert-expr (try
                              (requiring-resolve 'cljs.test/assert-expr)
                              (catch Throwable _))]
       (defmethod (var-get assert-expr) 'malli=
         [_env message [_ schema & actuals]]
         `(malli=-report ~message ~schema ~(vec actuals))))))
