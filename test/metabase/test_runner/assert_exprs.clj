(ns metabase.test-runner.assert-exprs
  "This namespace formerly had custom implementations of a few [[clojure.test/is]] expressions, but they are no more. It
  does however pull in the implementation for `malli=`, and a handful of namespaces load THIS one, so I guess we can
  keep it around for now.

  Other expressions (`re=`, `=?`, and so forth) are implemented with the Hawk test-runner."
  (:require
   [clojure.walk :as walk]
   [metabase.test-runner.assert-exprs.malli-equals]))

(comment metabase.test-runner.assert-exprs.malli-equals/keep-me)

;;; TODO (Cam 9/10/25) -- this is no longer used anywhere in the `metabase.test-runner.assert-exprs.*` world, so we
;;; should move it into a more general test util namespace.
(defn derecordize
  "Convert all record types in `form` to plain maps, so tests won't fail."
  [form]
  (walk/postwalk
   (fn [form]
     (if (record? form)
       (into {} form)
       form))
   form))
