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


;; Tests for remove-diacritical marks
(expect "uuuu" (remove-diacritical-marks "üuuü"))
(expect "aeiu" (remove-diacritical-marks "åéîü"))
(expect "acnx" (remove-diacritical-marks "åçñx"))
(expect nil    (remove-diacritical-marks ""))
(expect nil    (remove-diacritical-marks nil))

;;; Tests for slugify
(expect "toucanfest_2017"               (slugify "ToucanFest 2017"))
(expect "cam_s_awesome_toucan_emporium" (slugify "Cam's awesome toucan emporium"))
(expect "frequently_used_cards"         (slugify "Frequently-Used Cards"))
;; check that diactrics get removed
(expect "cam_saul_s_toucannery"         (slugify "Cam Saül's Toucannery"))
(expect "toucans_dislike_pinatas___"    (slugify "toucans dislike piñatas :("))
;; check that non-ASCII characters get URL-encoded (so we can support non-Latin alphabet languages; see #3818)
(expect "%E5%8B%87%E5%A3%AB"            (slugify "勇士")) ; go dubs


;;; select-nested-keys
(expect
  {:a 100, :b {:d 300}}
  (select-nested-keys {:a 100, :b {:c 200, :d 300}} [:a [:b :d] :c]))

(expect
  {:b {:c 200, :d 300}}
  (select-nested-keys {:a 100, :b {:c 200, :d 300}} [:b]))

(expect
  {:b {:c 200, :d 300}}
  (select-nested-keys {:a 100, :b {:c 200, :d 300}} [[:b :c :d]]))

(expect
  {:b {:d {:e 300}}}
  (select-nested-keys {:a 100, :b {:c 200, :d {:e 300}}} [[:b [:d :e]]]))

(expect
  {:b {:d {:e 300}}}
  (select-nested-keys {:a 100, :b {:c 200, :d {:e 300}}} [[:b :d]]))

(expect
  {:a {:b 100}, :d {:e 300}}
  (select-nested-keys {:a {:b 100, :c 200}, :d {:e 300, :f 400}} [[:a :b] [:d :e]]))

(expect
  {:a 100}
  (select-nested-keys {:a 100, :b {:c 200, :d 300}} [[:a]]))

(expect
  {}
  (select-nested-keys {:a 100, :b {:c 200, :d 300}} [:c]))

(expect
  {}
  (select-nested-keys nil [:c]))

(expect
  {}
  (select-nested-keys {} nil))

(expect
  {}
  (select-nested-keys {:a 100, :b {:c 200, :d 300}} []))

(expect
  {}
  (select-nested-keys {} [:c]))


;;; tests for base-64-string?
(expect (base-64-string? "ABc"))
(expect (base-64-string? "ABc/+asdasd=="))
(expect false (base-64-string? 100))
(expect false (base-64-string? "<<>>"))
(expect false (base-64-string? "{\"a\": 10}"))


;;; tests for `occurances-of-substring`

;; return nil if one or both strings are nil or empty
(expect nil (occurances-of-substring nil   nil))
(expect nil (occurances-of-substring nil   ""))
(expect nil (occurances-of-substring ""    nil))
(expect nil (occurances-of-substring ""    ""))
(expect nil (occurances-of-substring "ABC" ""))
(expect nil (occurances-of-substring "" "  ABC"))

(expect 1 (occurances-of-substring "ABC" "A"))
(expect 2 (occurances-of-substring "ABA" "A"))
(expect 3 (occurances-of-substring "AAA" "A"))

(expect 0 (occurances-of-substring "ABC"                                                                               "{{id}}"))
(expect 1 (occurances-of-substring "WHERE ID = {{id}}"                                                                 "{{id}}"))
(expect 2 (occurances-of-substring "WHERE ID = {{id}} OR USER_ID = {{id}}"                                             "{{id}}"))
(expect 3 (occurances-of-substring "WHERE ID = {{id}} OR USER_ID = {{id}} OR TOUCAN_ID = {{id}} OR BIRD_ID = {{bird}}" "{{id}}"))


;;; tests for `select-non-nil-keys` and `select-keys-when`
(expect
  {:a 100}
  (select-non-nil-keys {:a 100, :b nil} #{:a :b :c}))

(expect
  {:a 100, :b nil, :d 200}
  (select-keys-when {:a 100, :b nil, :d 200, :e nil}
    :present #{:a :b :c}
    :non-nil #{:d :e :f}))
