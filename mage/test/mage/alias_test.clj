(ns mage.alias-test
  (:require
   [clojure.test :refer [deftest is]]
   [mage.alias]))

(deftest noone-changed-the-markers
  (is (= "## MAGE (Metabase Automation Genius Engine)" mage.alias/marker-start))
  (is (= "## END MAGE [auto-installed]" mage.alias/marker-end)))
