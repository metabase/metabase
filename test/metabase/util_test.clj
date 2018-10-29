(ns metabase.util-test
  "Tests for functions in `metabase.util`."
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))

;;; ## tests for HOST-UP?

(expect true
  (host-up? "localhost"))

(expect false
  (host-up? "nosuchhost"))

;;; ## tests for HOST-PORT-UP?

(expect false
  (host-port-up? "nosuchhost" 8005))


;;; ## tests for URL?

(expect true (url? "http://google.com"))
(expect true (url? "https://google.com"))
(expect true (url? "https://amazon.co.uk"))
(expect true (url? "http://google.com?q=my-query&etc"))
(expect true (url? "http://www.cool.com"))
(expect true (url? "http://localhost/"))
(expect true (url? "http://localhost:3000"))
(expect true (url? "https://www.mapbox.com/help/data/stations.geojson"))
(expect true (url? "http://www.cool.com:3000"))
(expect true (url? "http://localhost:3000/auth/reset_password/144_f98987de-53ca-4335-81da-31bb0de8ea2b#new"))
(expect false (url? "google.com"))                      ; missing protocol
(expect false (url? "ftp://metabase.com"))              ; protocol isn't HTTP/HTTPS
(expect false (url? "http://metabasecom"))              ; no period / TLD
(expect false (url? "http://.com"))                     ; no domain
(expect false (url? "http://google."))                  ; no TLD
(expect false (url? "http:/"))                          ; nil .getAuthority needs to be handled or NullPointerException

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


;;; tests for base64-string?
(expect (base64-string? "ABc"))
(expect (base64-string? "ABc/+asdasd=="))
(expect false (base64-string? 100))
(expect false (base64-string? "<<>>"))
(expect false (base64-string? "{\"a\": 10}"))


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


;;; tests for `order-of-magnitude`
(expect -2 (order-of-magnitude 0.01))
(expect -1 (order-of-magnitude 0.5))
(expect 0  (order-of-magnitude 4))
(expect 1  (order-of-magnitude 12))
(expect 2  (order-of-magnitude 444))
(expect 3  (order-of-magnitude 1023))
(expect 0  (order-of-magnitude 0))
(expect 3  (order-of-magnitude -1444))


;;; tests for `update-when` and `update-in-when`
(expect {:foo 2}        (update-when {:foo 2} :bar inc))
(expect {:foo 2 :bar 3} (update-when {:foo 2 :bar 2} :bar inc))

(expect {:foo 2}        (update-in-when {:foo 2} [:foo :bar] inc))
(expect {:foo {:bar 3}} (update-in-when {:foo {:bar 2}} [:foo :bar] inc))


;;; tests for `index-of`
(expect 2   (index-of pos? [-1 0 2 3]))
(expect nil (index-of pos? [-1 0 -2 -3]))
(expect nil (index-of pos? nil))
(expect nil (index-of pos? []))


;; is-java-9-or-higher?
(expect
  false
  (is-java-9-or-higher? "1.8.0_141"))

(expect
  (is-java-9-or-higher? "1.9.0_141"))

(expect
 (is-java-9-or-higher? "10.0.1"))

;; make sure we can parse wacky version strings like `9-internal`: See #8282
(expect
  (is-java-9-or-higher? "9-internal"))

(expect
  {:num_cans 2, :lisp_case? {:nested_maps? true}}
  (snake-keys {:num-cans 2, :lisp-case? {:nested-maps? true}}))
