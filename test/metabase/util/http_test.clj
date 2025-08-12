(ns metabase.util.http-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.http :as http]))

(deftest valid-host?-test
  (testing "defaults to external-only when no strategy provided"
    (is (true? (http/valid-host? "https://example.com")))
    (is (false? (http/valid-host? "http://localhost")))
    (is (false? (http/valid-host? "http://192.168.1.1"))))

  (testing "external-only strategy"
    (is (true? (http/valid-host? "https://example.com" :external-only)))
    (is (false? (http/valid-host? "http://localhost" :external-only)))
    (is (false? (http/valid-host? "http://192.168.1.1" :external-only))))

  (testing "allow-private strategy allows private networks but not localhost"
    (is (true? (http/valid-host? "https://example.com" :allow-private)))
    (is (true? (http/valid-host? "http://192.168.1.1" :allow-private)))
    (is (true? (http/valid-host? "http://10.0.0.1" :allow-private)))
    (is (true? (http/valid-host? "http://172.16.0.1" :allow-private)))
    (is (false? (http/valid-host? "http://localhost" :allow-private)))
    (is (false? (http/valid-host? "http://127.0.0.1" :allow-private)))
    (is (false? (http/valid-host? "http://169.254.1.1" :allow-private))))

  (testing "allow-all strategy allows everything"
    (is (true? (http/valid-host? "https://example.com" :allow-all)))
    (is (true? (http/valid-host? "http://localhost" :allow-all)))
    (is (true? (http/valid-host? "http://192.168.1.1" :allow-all)))
    (is (true? (http/valid-host? "http://169.254.1.1" :allow-all)))))
