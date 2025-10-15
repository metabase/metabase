(ns metabase.util.http-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.http :as http]))

(deftest valid-host?-test
  (testing "external-only strategy (default)"
    (is (true? (http/valid-host? :external-only "https://example.com")))
    (is (false? (http/valid-host? :external-only "http://localhost")))
    (is (false? (http/valid-host? :external-only "http://192.168.1.1"))))

  (testing "external-only strategy explicitly"
    (is (true? (http/valid-host? :external-only "https://example.com")))
    (is (false? (http/valid-host? :external-only "http://localhost")))
    (is (false? (http/valid-host? :external-only "http://192.168.1.1"))))

  (testing "allow-private strategy allows private networks but not localhost"
    (is (true? (http/valid-host? :allow-private "https://example.com")))
    (is (true? (http/valid-host? :allow-private "http://192.168.1.1")))
    (is (true? (http/valid-host? :allow-private "http://10.0.0.1")))
    (is (true? (http/valid-host? :allow-private "http://172.16.0.1")))
    (is (false? (http/valid-host? :allow-private "http://localhost")))
    (is (false? (http/valid-host? :allow-private "http://127.0.0.1")))
    (is (false? (http/valid-host? :allow-private "http://169.254.1.1"))))

  (testing "allow-all strategy allows everything"
    (is (true? (http/valid-host? :allow-all "https://example.com")))
    (is (true? (http/valid-host? :allow-all "http://localhost")))
    (is (true? (http/valid-host? :allow-all "http://192.168.1.1")))
    (is (true? (http/valid-host? :allow-all "http://169.254.1.1")))))
