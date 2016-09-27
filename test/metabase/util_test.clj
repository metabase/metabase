(ns metabase.util-test
  "Tests for functions in `metabase.util`."
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))


;;; Date stuff

(def ^:private ^:const friday-the-13th   #inst "2015-11-13T19:05:55")
(def ^:private ^:const saturday-the-14th #inst "2015-11-14T04:18:26")

(expect false (is-temporal? nil))
(expect false (is-temporal? 123))
(expect false (is-temporal? "abc"))
(expect false (is-temporal? [1 2 3]))
(expect false (is-temporal? {:a "b"}))
(expect true (is-temporal? friday-the-13th))

(expect friday-the-13th (->Timestamp (->Date friday-the-13th)))
(expect friday-the-13th (->Timestamp (->Calendar friday-the-13th)))
(expect friday-the-13th (->Timestamp (->Calendar (.getTime friday-the-13th))))
(expect friday-the-13th (->Timestamp (.getTime friday-the-13th)))
(expect friday-the-13th (->Timestamp "2015-11-13T19:05:55+00:00"))

(expect nil (->iso-8601-datetime nil nil))
(expect "2015-11-13T19:05:55.000Z" (->iso-8601-datetime friday-the-13th nil))
(expect "2015-11-13T11:05:55.000-08:00" (->iso-8601-datetime friday-the-13th "US/Pacific"))
(expect "2015-11-14T04:05:55.000+09:00" (->iso-8601-datetime friday-the-13th "Asia/Tokyo"))

(expect 5    (date-extract :minute-of-hour  friday-the-13th))
(expect 19   (date-extract :hour-of-day     friday-the-13th))
(expect 6    (date-extract :day-of-week     friday-the-13th))
(expect 7    (date-extract :day-of-week     saturday-the-14th))
(expect 13   (date-extract :day-of-month    friday-the-13th))
(expect 317  (date-extract :day-of-year     friday-the-13th))
(expect 46   (date-extract :week-of-year    friday-the-13th))
(expect 11   (date-extract :month-of-year   friday-the-13th))
(expect 4    (date-extract :quarter-of-year friday-the-13th))
(expect 2015 (date-extract :year            friday-the-13th))

(expect #inst "2015-11-13T19:05" (date-trunc :minute  friday-the-13th))
(expect #inst "2015-11-13T19:00" (date-trunc :hour    friday-the-13th))
(expect #inst "2015-11-13"       (date-trunc :day     friday-the-13th))
(expect #inst "2015-11-08"       (date-trunc :week    friday-the-13th))
(expect #inst "2015-11-08"       (date-trunc :week    saturday-the-14th))
(expect #inst "2015-11-01"       (date-trunc :month   friday-the-13th))
(expect #inst "2015-10-01"       (date-trunc :quarter friday-the-13th))

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
