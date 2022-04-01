(ns metabase.db.honeysql-test
  (:require [clojure.test :refer :all]
            [honeysql.format :as hformat]
            [metabase.db.honeysql :as mdb.honeysql]
            [metabase.test :as mt]))

(comment mdb.honeysql/keep-me)

(deftest h2-quoting-test
  (testing (str "We provide our own quoting function for `:h2` databases. We quote and uppercase the identifier. Using "
                "Java's toUpperCase method is surprisingly locale dependent. When uppercasing a string in a language "
                "like Turkish, it can turn an i into an İ. This test converts a keyword with an `i` in it to verify "
                "that we convert the identifier correctly using the english locale even when the user has changed the "
                "locale to Turkish")
    (mt/with-locale "tr"
      (is (= ["\"SETTING\""]
             (hformat/format :setting :quoting :h2))))))
