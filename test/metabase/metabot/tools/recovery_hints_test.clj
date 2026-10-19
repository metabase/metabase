(ns metabase.metabot.tools.recovery-hints-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.tools.recovery-hints :as recovery-hints]))

(set! *warn-on-reflection* true)

(deftest ^:parallel ambiguous-field-hint-test
  (is (= (str "The field name matches more than one column in this table, so it cannot be referenced by name. "
              "Tell the user about the ambiguous column name.")
         (recovery-hints/recovery-hint {:error :ambiguous-field}))))
