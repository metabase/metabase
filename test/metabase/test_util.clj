(ns metabase.test-util
  "Tests for functions in `metabase.util`.
   TODO - Why isn't this named `metabase.util-test`?"
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))


;; tests for CONTAINS-MANY?

(let [m {:a 1 :b 1 :c 2}]
  (expect true (contains-many? m :a))
  (expect true (contains-many? m :a :b))
  (expect true (contains-many? m :a :b :c))
  (expect false (contains-many? m :a :d))
  (expect false (contains-many? m :a :b :d)))


;;; ## tests for SELECT-NON-NIL-KEYS

(expect {:a 100 :b 200}
  (select-non-nil-keys {:a 100 :b 200 :c nil :d 300} :a :b :c))


;;; ## tests for ASSOC*

(expect {:a 100
         :b 200
         :c 300}
  (assoc* {}
          :a 100
          :b (+ 100 (:a <>))
          :c (+ 100 (:b <>))))


;;; ## tests for HOST-UP?

(expect true
  (host-up? "localhost"))

(expect false
  (host-up? "nosuchhost"))

;;; ## tests for HOST-PORT-UP?

(expect false
  (host-port-up? "nosuchhost" 8005))


;; ## tests for `(format-num)`

(expect "1" (format-num 1))
(expect "1" (format-num (float 1)))
(expect "1" (format-num (double 1)))
(expect "1" (format-num (bigdec 1)))
(expect "1" (format-num (long 1)))
(expect "1.23" (format-num (float 1.23444)))
(expect "1.23" (format-num (double 1.23444)))
(expect "1.23" (format-num (bigdec 1.23444)))
(expect "1,234" (format-num 1234))
(expect "1,234" (format-num (float 1234)))
(expect "1,234" (format-num (double 1234)))
(expect "1,234" (format-num (bigdec 1234)))
(expect "1,234" (format-num (long 1234)))
(expect "1,234.56" (format-num (float 1234.5678)))
(expect "1,234.56" (format-num (double 1234.5678)))
(expect "1,234.56" (format-num (bigdec 1234.5678)))


;;; ## tests for IS-URL?

(expect true (is-url? "http://google.com"))
(expect true (is-url? "https://google.com"))
(expect true (is-url? "https://amazon.co.uk"))
(expect true (is-url? "http://google.com?q=my-query&etc"))
(expect true (is-url? "http://www.cool.com"))
(expect false (is-url? "google.com"))                      ; missing protocol
(expect false (is-url? "ftp://metabase.com"))              ; protocol isn't HTTP/HTTPS
(expect false (is-url? "http://metabasecom"))              ; no period / TLD
(expect false (is-url? "http://.com"))                     ; no domain
(expect false (is-url? "http://google."))                  ; no TLD


;;; ## tests for RPARTIAL

(expect 3
  ((rpartial - 5) 8))

(expect -7
  ((rpartial - 5 10) 8))
