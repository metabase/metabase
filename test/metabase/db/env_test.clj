(ns metabase.db.env-test
  (:require [clojure.test :refer :all]
            [metabase.db.env :as mdb.env]))

(deftest connection-string->db-type-test
  (doseq [[subprotocol expected] {"postgres"   :postgres
                                  "postgresql" :postgres
                                  "mysql"      :mysql
                                  "h2"         :h2}
          protocol               [subprotocol (str "jdbc:" subprotocol)]
          url                    [(str protocol "://abc")
                                  (str protocol ":abc")
                                  (str protocol ":cam@localhost/my_db?password=123456")
                                  (str protocol "://localhost/my_db")]]
    (testing (pr-str (list 'connection-string->db-type url))
      (is (= expected
             (#'mdb.env/connection-string->db-type url)))))
  (testing "Should throw an Exception for an unsupported subprotocol"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Unsupported application database type: \"sqlserver\""
         (#'mdb.env/connection-string->db-type "jdbc:sqlserver://bad")))))
