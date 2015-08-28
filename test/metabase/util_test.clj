(ns metabase.util-test
  "Tests for functions in `metabase.util`."
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


;;; # ------------------------------------------------------------ DATE FUNCTIONS ------------------------------------------------------------

;;; ## PARSE-DATE-YYYY-MM-DD
(expect #inst "2014-01-01T08" (parse-rfc-3339 "2014-01-01"))
(expect #inst "2014-03-03T08" (parse-rfc-3339 "2014-02-31"))

;;; ## DATE->YYYY-MM-DD
(expect "2014-01-01" (date->yyyy-mm-dd #inst "2014-01-01T08"))
(expect "2014-03-03" (date->yyyy-mm-dd #inst "2014-03-03T08"))

;;; ## DATE-STRING-YYYY-MM-DD??
(expect false (date-string? nil))
(expect false (date-string? 100))
(expect false (date-string? ""))
(expect true  (date-string? "2014-01-01"))
(expect true  (date-string? "2014-02-31"))
(expect false (date-string? "2014-2-31"))
(expect false (date-string? "2014-32-31"))
(expect false (date-string? "2014-02-1"))
(expect true  (date-string? "2014-02-01"))

;;; ## DAYS-AGO
(expect #inst "2014-01-01T08" (relative-date -1    :day #inst "2014-01-02T08"))
(expect #inst "2013-12-31T08" (relative-date -2    :day #inst "2014-01-02T08"))
(expect #inst "2014-03-02T08" (relative-date -1    :day #inst "2014-03-03T08"))
(expect #inst "2013-09-23T07" (relative-date -100  :day #inst "2014-01-01T08"))
(expect #inst "2011-04-07T07" (relative-date -1000 :day #inst "2014-01-01T08"))
(expect #inst "2014-03-01T08" (relative-date 1     :day #inst "2014-02-28T08"))

;; Make sure it doesn't modify the date
(expect #inst "2014-01-01T08"
        (let [d #inst "2014-01-01T08"]
          (relative-date -1 :day d)
          d))

;;; ## MONTHS-AGO
(expect #inst "2013-12-02T08" (relative-date -1    :month #inst "2014-01-02T08"))
(expect #inst "2013-11-02T07" (relative-date -2    :month #inst "2014-01-02T08"))
(expect #inst "2014-02-03T08" (relative-date -1    :month #inst "2014-03-03T08"))
(expect #inst "2005-09-01T07" (relative-date -100  :month #inst "2014-01-01T08"))
(expect #inst "1930-09-01T08" (relative-date -1000 :month #inst "2014-01-01T08"))
(expect #inst "2014-03-28T07" (relative-date 1     :month #inst "2014-02-28T08"))

(expect #inst "2014-01-01T08"
        (let [d #inst "2014-01-01T08"]
          (relative-date -1 :month d)
          d))

;;; ## YEARS-AGO
(expect #inst "2013-01-02T08" (relative-date -1    :year #inst "2014-01-02T08"))
(expect #inst "2012-01-02T08" (relative-date -2    :year #inst "2014-01-02T08"))
(expect #inst "2013-03-03T08" (relative-date -1    :year #inst "2014-03-03T08"))
(expect #inst "1914-01-01T08" (relative-date -100  :year #inst "2014-01-01T08"))
(expect #inst "1014-01-01T08" (relative-date -1000 :year #inst "2014-01-01T08"))
(expect #inst "2015-02-28T08" (relative-date 1     :year #inst "2014-02-28T08"))

(expect #inst "2014-01-01T08"
        (let [d #inst "2014-01-01T08"]
          (relative-date -1 :year d)
          d))
