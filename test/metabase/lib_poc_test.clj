(ns metabase.lib-poc-test
  (:require [clojure.test :refer :all]
            [metabase.lib.core :as lib]))

(deftest hello-world
  (is (= "Hello, Cam!"
         (lib/hello-world "Cam"))))
