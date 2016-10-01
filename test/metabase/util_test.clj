(ns metabase.util-test
  "Tests for functions in `metabase.util`."
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))


;;; Date stuff

(def ^:private ^:const saturday-the-31st   #inst "2005-12-31T19:05:55")
(def ^:private ^:const sunday-the-1st #inst "2006-01-01T04:18:26")

(expect false (is-temporal? nil))
(expect false (is-temporal? 123))
(expect false (is-temporal? "abc"))
(expect false (is-temporal? [1 2 3]))
(expect false (is-temporal? {:a "b"}))
(expect true (is-temporal? saturday-the-31st))

(expect saturday-the-31st (->Timestamp (->Date saturday-the-31st)))
(expect saturday-the-31st (->Timestamp (->Calendar saturday-the-31st)))
(expect saturday-the-31st (->Timestamp (->Calendar (.getTime saturday-the-31st))))
(expect saturday-the-31st (->Timestamp (.getTime saturday-the-31st)))
(expect saturday-the-31st (->Timestamp "2005-12-31T19:05:55+00:00"))

(expect nil (->iso-8601-datetime nil nil))
(expect "2005-12-31T19:05:55.000Z" (->iso-8601-datetime saturday-the-31st nil))
(expect "2005-12-31T11:05:55.000-08:00" (->iso-8601-datetime saturday-the-31st "US/Pacific"))
(expect "2006-01-01T04:05:55.000+09:00" (->iso-8601-datetime saturday-the-31st "Asia/Tokyo"))


(expect 5    (date-extract :minute-of-hour  saturday-the-31st   "UTC"))
(expect 19   (date-extract :hour-of-day     saturday-the-31st   "UTC"))
(expect 7    (date-extract :day-of-week     saturday-the-31st   "UTC"))
(expect 1    (date-extract :day-of-week     sunday-the-1st      "UTC"))
(expect 31   (date-extract :day-of-month    saturday-the-31st   "UTC"))
(expect 365  (date-extract :day-of-year     saturday-the-31st   "UTC"))
(expect 53   (date-extract :week-of-year    saturday-the-31st   "UTC"))
(expect 12   (date-extract :month-of-year   saturday-the-31st   "UTC"))
(expect 4    (date-extract :quarter-of-year saturday-the-31st   "UTC"))
(expect 2005 (date-extract :year            saturday-the-31st   "UTC"))

(expect 5    (date-extract :minute-of-hour  saturday-the-31st   "US/Pacific"))
(expect 11   (date-extract :hour-of-day     saturday-the-31st   "US/Pacific"))
(expect 7    (date-extract :day-of-week     saturday-the-31st   "US/Pacific"))
(expect 7    (date-extract :day-of-week     sunday-the-1st      "US/Pacific"))
(expect 31   (date-extract :day-of-month    saturday-the-31st   "US/Pacific"))
(expect 365  (date-extract :day-of-year     saturday-the-31st   "US/Pacific"))
(expect 53   (date-extract :week-of-year    saturday-the-31st   "US/Pacific"))
(expect 12   (date-extract :month-of-year   saturday-the-31st   "US/Pacific"))
(expect 4    (date-extract :quarter-of-year saturday-the-31st   "US/Pacific"))
(expect 2005 (date-extract :year            saturday-the-31st   "US/Pacific"))

(expect 5    (date-extract :minute-of-hour  saturday-the-31st   "Asia/Tokyo"))
(expect 4    (date-extract :hour-of-day     saturday-the-31st   "Asia/Tokyo"))
(expect 1    (date-extract :day-of-week     saturday-the-31st   "Asia/Tokyo"))
(expect 1    (date-extract :day-of-week     sunday-the-1st      "Asia/Tokyo"))
(expect 1    (date-extract :day-of-month    saturday-the-31st   "Asia/Tokyo"))
(expect 1    (date-extract :day-of-year     saturday-the-31st   "Asia/Tokyo"))
(expect 1    (date-extract :week-of-year    saturday-the-31st   "Asia/Tokyo"))
(expect 1    (date-extract :month-of-year   saturday-the-31st   "Asia/Tokyo"))
(expect 1    (date-extract :quarter-of-year saturday-the-31st   "Asia/Tokyo"))
(expect 2006 (date-extract :year            saturday-the-31st   "Asia/Tokyo"))


(expect #inst "2005-12-31T19:05" (date-trunc :minute  saturday-the-31st   "UTC"))
(expect #inst "2005-12-31T19:00" (date-trunc :hour    saturday-the-31st   "UTC"))
(expect #inst "2005-12-31"       (date-trunc :day     saturday-the-31st   "UTC"))
(expect #inst "2005-12-25"       (date-trunc :week    saturday-the-31st   "UTC"))
(expect #inst "2006-01-01"       (date-trunc :week    sunday-the-1st      "UTC"))
(expect #inst "2005-12-01"       (date-trunc :month   saturday-the-31st   "UTC"))
(expect #inst "2005-10-01"       (date-trunc :quarter saturday-the-31st   "UTC"))

(expect #inst "2005-12-31T19:05" (date-trunc :minute  saturday-the-31st   "Asia/Tokyo"))
(expect #inst "2005-12-31T19:00" (date-trunc :hour    saturday-the-31st   "Asia/Tokyo"))
(expect #inst "2006-01-01+09:00" (date-trunc :day     saturday-the-31st   "Asia/Tokyo"))
(expect #inst "2006-01-01+09:00" (date-trunc :week    saturday-the-31st   "Asia/Tokyo"))
(expect #inst "2006-01-01+09:00" (date-trunc :week    sunday-the-1st      "Asia/Tokyo"))
(expect #inst "2006-01-01+09:00" (date-trunc :month   saturday-the-31st   "Asia/Tokyo"))
(expect #inst "2006-01-01+09:00" (date-trunc :quarter saturday-the-31st   "Asia/Tokyo"))

(expect #inst "2005-12-31T19:05" (date-trunc :minute  saturday-the-31st   "US/Pacific"))
(expect #inst "2005-12-31T19:00" (date-trunc :hour    saturday-the-31st   "US/Pacific"))
(expect #inst "2005-12-31-08:00" (date-trunc :day     saturday-the-31st   "US/Pacific"))
(expect #inst "2005-12-25-08:00" (date-trunc :week    saturday-the-31st   "US/Pacific"))
(expect #inst "2005-12-25-08:00" (date-trunc :week    sunday-the-1st      "US/Pacific"))
(expect #inst "2005-12-01-08:00" (date-trunc :month   saturday-the-31st   "US/Pacific"))
(expect #inst "2005-10-01-08:00" (date-trunc :quarter saturday-the-31st   "US/Pacific"))

;;; ## tests for HOST-UP?

(expect true
  (host-up? "localhost"))

(expect false
  (host-up? "nosuchhost"))

;;; ## tests for HOST-PORT-UP?

(expect false
  (host-port-up? "nosuchhost" 8005))


;;; ## tests for IS-URL?

(expect true (is-url? "http://google.com"))
(expect true (is-url? "https://google.com"))
(expect true (is-url? "https://amazon.co.uk"))
(expect true (is-url? "http://google.com?q=my-query&etc"))
(expect true (is-url? "http://www.cool.com"))
(expect true (is-url? "http://localhost/"))
(expect true (is-url? "http://localhost:3000"))
(expect true (is-url? "https://www.mapbox.com/help/data/stations.geojson"))
(expect true (is-url? "http://www.cool.com:3000"))
(expect true (is-url? "http://localhost:3000/auth/reset_password/144_f98987de-53ca-4335-81da-31bb0de8ea2b#new"))
(expect false (is-url? "google.com"))                      ; missing protocol
(expect false (is-url? "ftp://metabase.com"))              ; protocol isn't HTTP/HTTPS
(expect false (is-url? "http://metabasecom"))              ; no period / TLD
(expect false (is-url? "http://.com"))                     ; no domain
(expect false (is-url? "http://google."))                  ; no TLD
(expect false (is-url? "http:/"))                          ; nil .getAuthority needs to be handled or NullPointerException

;;; ## tests for RPARTIAL

(expect 3
  ((rpartial - 5) 8))

(expect -7
  ((rpartial - 5 10) 8))


;;; TESTS FOR key-by
(expect
  {1 {:id 1, :name "Rasta"}
   2 {:id 2, :name "Lucky"}}
  (key-by :id [{:id 1, :name "Rasta"}
               {:id 2, :name "Lucky"}]))
