(ns metabase.lib.field-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.field :as lib.field]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel field-from-database-metadata-test
  (let [f (lib.field/field (meta/field-metadata :venues :id))]
    (is (fn? f))
    (is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
            (f {:lib/metadata meta/metadata-provider} -1)))
    (is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
            (#'lib.field/->field {:lib/metadata meta/metadata-provider} -1 f)))))
