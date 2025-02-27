(ns metabase.channel.email.result-attachment-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.email.result-attachment :as email.result-attachment])
  (:import
   (java.io IOException)))

(set! *warn-on-reflection* true)

(defmacro ^:private with-create-temp-failure! [& body]
  `(with-redefs [email.result-attachment/create-temp-file (fn [~'_]
                                                            (throw (IOException. "Failed to write file")))]
     ~@body))

;; Test that IOException bubbles up
(deftest throws-exception
  (is (thrown-with-msg?
       IOException
       (re-pattern (format "Unable to create temp file in `%s`" (System/getProperty "java.io.tmpdir")))
       (with-create-temp-failure!
         (#'email.result-attachment/create-temp-file-or-throw "txt")))))
