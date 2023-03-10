(ns metabase.lib.field-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.field :as lib.field]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(deftest ^:parallel field-from-database-metadata-test
  (is (=? [:field {:base-type :type/BigInteger, :lib/uuid string?} (meta/id :venues :id)]
          (lib.field/field {:lib/metadata meta/metadata-provider} (meta/field-metadata :venues :id)))))
