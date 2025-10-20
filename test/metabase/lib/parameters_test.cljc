(ns metabase.lib.parameters-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]))

(deftest ^:parallel parameter-target-field-id-test
  (is (= 256
         (lib/parameter-target-field-id [:dimension [:field 256 nil]]))))
