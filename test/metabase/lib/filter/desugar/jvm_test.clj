(ns metabase.lib.filter.desugar.jvm-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.filter.desugar :as lib.filter.desugar]
   [metabase.lib.filter.desugar.jvm :as lib.filter.desugar.jvm]))

(defn- opts [& {:as kvs}]
  (merge {:lib/uuid (str (random-uuid))} kvs))

(deftest ^:parallel host-regex-on-urls-test
  (are [host url] (= host (re-find @#'lib.filter.desugar.jvm/host-regex url))
    "cdbaby.com"      "https://cdbaby.com/some.txt"
    "fema.gov"        "https://fema.gov/some/path/Vatini?search=foo"
    "geocities.jp"    "https://www.geocities.jp/some/path/Turbitt?search=foo"
    "jalbum.net"      "https://jalbum.net/some/path/Kirsz?search=foo"
    "usa.gov"         "https://usa.gov/some/path/Curdell?search=foo"
    ;; Oops, this one captures a subdomain because it can't tell va.gov is supposed to be that short.
    "taxes.va.gov"    "http://taxes.va.gov/some/path/Marritt?search=foo"
    "gmpg.org"        "http://log.stuff.gmpg.org/some/path/Cambden?search=foo"
    "hatena.ne.jp"    "http://hatena.ne.jp/"
    "telegraph.co.uk" "//telegraph.co.uk?foo=bar#tail"
    "bbc.co.uk"       "bbc.co.uk/some/path?search=foo"
    "bbc.co.uk"       "news.bbc.co.uk:port"))

(deftest ^:parallel host-regex-on-emails-test
  (are [host email] (= host (re-find @#'lib.filter.desugar.jvm/host-regex email))
    "metabase.com"      "braden@metabase.com"
    "homeoffice.gov.uk" "mholmes@homeoffice.gov.uk"
    "someisp.com"       "john.smith@mail.someisp.com"
    "amazon.co.uk"      "trk@amazon.co.uk"
    "hatena.ne.jp"      "takashi@hatena.ne.jp"
    "hatena.ne.jp"      "takashi@mail.hatena.ne.jp"
    "ne.jp"             "takashi@www.ne.jp"))

(deftest ^:parallel domain-regex-on-urls-test
  (are [domain url] (= domain (re-find @#'lib.filter.desugar.jvm/domain-regex url))
    "cdbaby"    "https://cdbaby.com/some.txt"
    "fema"      "https://fema.gov/some/path/Vatini?search=foo"
    "geocities" "https://www.geocities.jp/some/path/Turbitt?search=foo"
    "jalbum"    "https://jalbum.net/some/path/Kirsz?search=foo"
    "usa"       "https://usa.gov/some/path/Curdell?search=foo"
    "taxes"     "http://taxes.va.gov/some/path/Marritt?search=foo"
    "gmpg"      "http://log.stuff.gmpg.org/some/path/Cambden?search=foo"
    "hatena"    "http://hatena.ne.jp/"
    "telegraph" "//telegraph.co.uk?foo=bar#tail"
    "bbc"       "bbc.co.uk/some/path?search=foo"))

(deftest ^:parallel domain-regex-on-emails-test
  (are [domain email] (= domain (re-find @#'lib.filter.desugar.jvm/domain-regex email))
    "metabase"   "braden@metabase.com"
    "homeoffice" "mholmes@homeoffice.gov.uk"
    "someisp"    "john.smith@mail.someisp.com"
    "amazon"     "trk@amazon.co.uk"
    "hatena"     "takashi@hatena.ne.jp"
    "ne"         "takashi@www.ne.jp"))

(deftest ^:parallel subdomain-regex-on-urls-test
  (are [subdomain url] (= subdomain (re-find @#'lib.filter.desugar.jvm/subdomain-regex url))
       ;; Blanks. "www" doesn't count.
    nil "cdbaby.com"
    nil "https://fema.gov"
    nil "http://www.geocities.jp"
    nil "usa.gov/some/page.cgi.htm"
    nil "va.gov"

       ;; Basics - taking the first segment that isn't "www", IF it isn't the domain.
    "sub"        "sub.jalbum.net"
    "subdomains" "subdomains.go.here.jalbum.net"
    "log"        "log.stuff.gmpg.org"
    "log"        "https://log.stuff.gmpg.org"
    "log"        "log.stuff.gmpg.org/some/path"
    "log"        "log.stuff.gmpg.org?search=yes"

       ;; Oops, we miss these! This is the reverse of the problem when picking the domain.
       ;; We can't tell without maintaining a huge list that va and ne are the real domains, and not the trailing
       ;; fragments like .co.uk - see below.
    nil "taxes.va.gov" ; True domain is va, subdomain is taxes.
    nil "hatena.ne.jp" ; True domain is ne, subdomain is hatena.

       ;; Sometimes the second-last part is a short suffix.
       ;; Mozilla maintains a huge list of these, but since this has to go into a regex and get passed to the database,
       ;; we use a best-effort matcher that gets the domain right most of the time.
    nil         "telegraph.co.uk"
    nil         "https://telegraph.co.uk"
    nil         "telegraph.co.uk/some/article.php"
    "local"     "local.news.telegraph.co.uk"
    nil         "bbc.co.uk#fragment"
    "video"     "video.bbc.co.uk"
       ;; "www" is disregarded as a possible subdomain.
    nil         "www.usa.gov"
    nil         "www.dot.va.gov"
    "licensing" "www.licensing.dot.va.gov"))

(deftest ^:parallel path-regex-on-urls-test
  (are [path url] (= path (re-find @#'lib.filter.desugar.jvm/path-regex url))
    "/some.txt"          "https://cdbaby.com/some.txt"
    "/some/path/Vatini"  "https://fema.gov/some/path/Vatini?search=foo"
    "/some/path/Turbitt" "https://www.geocities.jp/some/path/Turbitt?search=foo"
    "/some/path/Kirsz"   "https://jalbum.net/some/path/Kirsz?search=foo"
    "/some/path/Curdell" "https://usa.gov/some/path/Curdell?search=foo"
    "/some/path/Marritt" "http://taxes.va.gov/some/path/Marritt?search=foo"
    "/some/path/Cambden" "http://log.stuff.gmpg.org/some/path/Cambden?search=foo"
    "/"                  "http://hatena.ne.jp/"
    nil                  "//telegraph.co.uk?foo=bar#tail"
    "/some/path"         "bbc.co.uk/some/path?search=foo"))

(deftest ^:parallel desugar-host-and-domain-test-1
  (testing "`host` should desugar to a `regex-match-first` clause with the host regex"
    (is (=? [:regex-match-first {} [:field {} 1] (str @#'lib.filter.desugar.jvm/host-regex)]
            (#'lib.filter.desugar/desugar-expression [:host (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-host-and-domain-test-2
  (testing "`domain` should desugar to a `regex-match-first` clause with the domain regex"
    (is (=? [:regex-match-first {} [:field {} 1] (str @#'lib.filter.desugar.jvm/domain-regex)]
            (#'lib.filter.desugar/desugar-expression [:domain (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-host-and-domain-test-3
  (testing "`subdomain` should desugar to a `regex-match-first` clause with the subdomain regex"
    (is (=? [:regex-match-first {} [:field {} 1] (str @#'lib.filter.desugar.jvm/subdomain-regex)]
            (#'lib.filter.desugar/desugar-expression [:subdomain (opts) [:field (opts) 1]])))))

(deftest ^:parallel desugar-host-and-domain-test-4
  (testing "`path` should desugar to a `regex-match-first` clause with the path regex"
    (is (=? [:regex-match-first {} [:field {} 1] (str @#'lib.filter.desugar.jvm/path-regex)]
            (#'lib.filter.desugar/desugar-expression [:path (opts) [:field (opts) 1]])))))
