(ns metabase.test-util
  "Tests for functions in `metabase.util`.
   TODO - Why isn't this named `metabase.util-test`?"
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))


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

;; basic whole number case
(expect "1" (format-num 1))
(expect "1" (format-num (float 1)))
(expect "1" (format-num (double 1)))
(expect "1" (format-num (bigdec 1)))
(expect "1" (format-num (long 1)))
;; make sure we correctly format down to 2 decimal places
;; note that we are expecting a round DOWN in this case
(expect "1.23" (format-num (float 1.23444)))
(expect "1.23" (format-num (double 1.23444)))
(expect "1.23" (format-num (bigdec 1.23444)))
;; test that we always force precision of 2 on decimal places
(expect "1.20" (format-num (float 1.2)))
(expect "1.20" (format-num (double 1.2)))
(expect "1.20" (format-num (bigdec 1.2)))
;; we can take big numbers and add in commas
(expect "1,234" (format-num 1234))
(expect "1,234" (format-num (float 1234)))
(expect "1,234" (format-num (double 1234)))
(expect "1,234" (format-num (bigdec 1234)))
(expect "1,234" (format-num (long 1234)))
;; we can handle numbers with both commas and decimal places
;; note that we expect a basic round UP here
(expect "1,234.57" (format-num (float 1234.5678)))
(expect "1,234.57" (format-num (double 1234.5678)))
(expect "1,234.57" (format-num (bigdec 1234.5678)))


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


;;; ## cond-as->
(expect 100
  (cond-as-> 100 <>))

(expect 106
  (cond-as-> 100 <>
    true  (+  1 <>)
    false (+ 10 <>)
    :ok   (+  5 <>)))

(expect 101
  (cond-as-> 100 <>
    (odd? <>)  (inc <>)
    (even? <>) (inc <>)))

(expect 102
  (cond-as-> 100 <>
    (even? <>) (inc <>)
    (odd? <>)  (inc <>)))
