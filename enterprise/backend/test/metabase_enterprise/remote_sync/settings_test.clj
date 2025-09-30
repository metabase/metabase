(ns metabase-enterprise.remote-sync.settings-test
  (:require [clojure.test :refer :all]
            [metabase.settings.core :as setting]
            [metabase.test :as mt]))

(deftest cannot-set-remote-sync-type-to-invalid-value)
(mt/with-temporary-setting-values [:remote-sync-type :production]
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Remote-sync-type set to an unsupported value"
                        (setting/set-value-of-type! :keyword :remote-sync-type :invalid-type))))
