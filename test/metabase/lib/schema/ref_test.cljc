(ns metabase.lib.schema.ref-test
  (:require
   [clojure.test :refer [are deftest is]]
   [malli.core :as mc]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.ref]))

(comment metabase.lib.schema.ref/keep-me)

(deftest ^:parallel unknown-type-test
  (let [expr [:field {:lib/uuid "214211bc-9bc0-4025-afc5-2256a523bafe"} 1]]
    (is (= ::expression/type.unknown
           (expression/type-of expr)))
    (is (expression/type-of? expr :type/Boolean))
    (are [schema] (mc/validate schema expr)
      ::expression/boolean
      ::expression/expression)))
