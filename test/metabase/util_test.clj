(ns metabase.util-test
  "Tests for functions in `metabase.util`."
  (:require [expectations :refer [expect]]
            [metabase.util :as u]))

;;; `host-up?` and `host-port-up?`

(expect
  (u/host-up? "localhost"))

(expect
  false
  (u/host-up? "nosuchhost"))

(expect
  false
  (u/host-port-up? "nosuchhost" 8005))


;;; `url?`
(expect true  (u/url? "http://google.com"))
(expect true  (u/url? "https://google.com"))
(expect true  (u/url? "https://amazon.co.uk"))
(expect true  (u/url? "http://google.com?q=my-query&etc"))
(expect true  (u/url? "http://www.cool.com"))
(expect true  (u/url? "http://localhost/"))
(expect true  (u/url? "http://localhost:3000"))
(expect true  (u/url? "https://www.mapbox.com/help/data/stations.geojson"))
(expect true  (u/url? "http://www.cool.com:3000"))
(expect true  (u/url? "http://localhost:3000/auth/reset_password/144_f98987de-53ca-4335-81da-31bb0de8ea2b#new"))
(expect true  (u/url? "http://192.168.1.10/"))
(expect false (u/url? "google.com"))                      ; missing protocol
(expect false (u/url? "ftp://metabase.com"))              ; protocol isn't HTTP/HTTPS
(expect false (u/url? "http://.com"))                     ; no domain
(expect false (u/url? "http://google."))                  ; no TLD
(expect false (u/url? "http:/"))                          ; nil .getAuthority needs to be handled or NullPointerException


;;; `rpartial`
(expect 3
  ((u/rpartial - 5) 8))

(expect -7
  ((u/rpartial - 5 10) 8))


;;; `key-by`
(expect
  {1 {:id 1, :name "Rasta"}
   2 {:id 2, :name "Lucky"}}
  (u/key-by :id [{:id 1, :name "Rasta"}
                 {:id 2, :name "Lucky"}]))


;; `remove-diacritical-marks`
(expect "uuuu" (u/remove-diacritical-marks "üuuü"))
(expect "aeiu" (u/remove-diacritical-marks "åéîü"))
(expect "acnx" (u/remove-diacritical-marks "åçñx"))
(expect nil    (u/remove-diacritical-marks ""))
(expect nil    (u/remove-diacritical-marks nil))


;;; `slugify`
(expect "toucanfest_2017"               (u/slugify "ToucanFest 2017"))
(expect "cam_s_awesome_toucan_emporium" (u/slugify "Cam's awesome toucan emporium"))
(expect "frequently_used_cards"         (u/slugify "Frequently-Used Cards"))
;; check that diactrics get removed
(expect "cam_saul_s_toucannery"         (u/slugify "Cam Saul's Toucannery"))
(expect "toucans_dislike_pinatas___"    (u/slugify "toucans dislike piñatas :("))
;; check that non-ASCII characters get URL-encoded (so we can support non-Latin alphabet languages; see #3818)
(expect "%E5%8B%87%E5%A3%AB"            (u/slugify "勇士")) ; go dubs


;;; `select-nested-keys`
(expect
  {:a 100, :b {:d 300}}
  (u/select-nested-keys {:a 100, :b {:c 200, :d 300}} [:a [:b :d] :c]))

(expect
  {:b {:c 200, :d 300}}
  (u/select-nested-keys {:a 100, :b {:c 200, :d 300}} [:b]))

(expect
  {:b {:c 200, :d 300}}
  (u/select-nested-keys {:a 100, :b {:c 200, :d 300}} [[:b :c :d]]))

(expect
  {:b {:d {:e 300}}}
  (u/select-nested-keys {:a 100, :b {:c 200, :d {:e 300}}} [[:b [:d :e]]]))

(expect
  {:b {:d {:e 300}}}
  (u/select-nested-keys {:a 100, :b {:c 200, :d {:e 300}}} [[:b :d]]))

(expect
  {:a {:b 100}, :d {:e 300}}
  (u/select-nested-keys {:a {:b 100, :c 200}, :d {:e 300, :f 400}} [[:a :b] [:d :e]]))

(expect
  {:a 100}
  (u/select-nested-keys {:a 100, :b {:c 200, :d 300}} [[:a]]))

(expect
  {}
  (u/select-nested-keys {:a 100, :b {:c 200, :d 300}} [:c]))

(expect
  {}
  (u/select-nested-keys nil [:c]))

(expect
  {}
  (u/select-nested-keys {} nil))

(expect
  {}
  (u/select-nested-keys {:a 100, :b {:c 200, :d 300}} []))

(expect
  {}
  (u/select-nested-keys {} [:c]))


;;; `base64-string?`
(expect (u/base64-string? "ABc"))
(expect (u/base64-string? "ABc/+asdasd=="))
(expect false (u/base64-string? 100))
(expect false (u/base64-string? "<<>>"))
(expect false (u/base64-string? "{\"a\": 10}"))


;;; `occurances-of-substring`
;; return nil if one or both strings are nil or empty
(expect nil (u/occurances-of-substring nil   nil))
(expect nil (u/occurances-of-substring nil   ""))
(expect nil (u/occurances-of-substring ""    nil))
(expect nil (u/occurances-of-substring ""    ""))
(expect nil (u/occurances-of-substring "ABC" ""))
(expect nil (u/occurances-of-substring "" "  ABC"))

(expect 1 (u/occurances-of-substring "ABC" "A"))
(expect 2 (u/occurances-of-substring "ABA" "A"))
(expect 3 (u/occurances-of-substring "AAA" "A"))

(expect 0 (u/occurances-of-substring "ABC"                                                                               "{{id}}"))
(expect 1 (u/occurances-of-substring "WHERE ID = {{id}}"                                                                 "{{id}}"))
(expect 2 (u/occurances-of-substring "WHERE ID = {{id}} OR USER_ID = {{id}}"                                             "{{id}}"))
(expect 3 (u/occurances-of-substring "WHERE ID = {{id}} OR USER_ID = {{id}} OR TOUCAN_ID = {{id}} OR BIRD_ID = {{bird}}" "{{id}}"))


;;; tests for `select-non-nil-keys` and `select-keys-when`
(expect
  {:a 100}
  (u/select-non-nil-keys {:a 100, :b nil} #{:a :b :c}))

(expect
  {:a 100, :b nil, :d 200}
  (u/select-keys-when {:a 100, :b nil, :d 200, :e nil}
    :present #{:a :b :c}
    :non-nil #{:d :e :f}))


;;; tests for `order-of-magnitude`
(expect -2 (u/order-of-magnitude 0.01))
(expect -1 (u/order-of-magnitude 0.5))
(expect 0  (u/order-of-magnitude 4))
(expect 1  (u/order-of-magnitude 12))
(expect 2  (u/order-of-magnitude 444))
(expect 3  (u/order-of-magnitude 1023))
(expect 0  (u/order-of-magnitude 0))
(expect 3  (u/order-of-magnitude -1444))


;;; `update-when` and `update-in-when`
(expect {:foo 2}        (u/update-when {:foo 2} :bar inc))
(expect {:foo 2 :bar 3} (u/update-when {:foo 2 :bar 2} :bar inc))

(expect {:foo 2}        (u/update-in-when {:foo 2} [:foo :bar] inc))
(expect {:foo {:bar 3}} (u/update-in-when {:foo {:bar 2}} [:foo :bar] inc))


;;; `index-of`
(expect 2   (u/index-of pos? [-1 0 2 3]))
(expect nil (u/index-of pos? [-1 0 -2 -3]))
(expect nil (u/index-of pos? nil))
(expect nil (u/index-of pos? []))


;; `is-java-9-or-higher?`
(expect
  false
  (u/is-java-9-or-higher? "1.8.0_141"))

(expect
  (u/is-java-9-or-higher? "1.9.0_141"))

(expect
  (u/is-java-9-or-higher? "10.0.1"))

(expect
  (u/is-java-9-or-higher? "11.0.1"))

;; make sure we can parse wacky version strings like `9-internal`: See #8282
(expect
  (u/is-java-9-or-higher? "9-internal"))

;; `snake-keys`
(expect
  {:num_cans 2, :lisp_case? {:nested_maps? true}}
  (u/snake-keys {:num-cans 2, :lisp-case? {:nested-maps? true}}))
