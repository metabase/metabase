(ns metabase.legacy-mbql.jvm-util-test
  (:require
   [clojure.test :as t]
   [metabase.legacy-mbql.jvm-util :as mbql.jvm-u]
   [metabase.legacy-mbql.util :as mbql.u]))

(t/deftest ^:parallel host-regex-on-urls-test
  (t/are [host url] (= host (re-find @#'mbql.jvm-u/host-regex url))
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

(t/deftest ^:parallel host-regex-on-emails-test
  (t/are [host email] (= host (re-find @#'mbql.jvm-u/host-regex email))
    "metabase.com"      "braden@metabase.com"
    "homeoffice.gov.uk" "mholmes@homeoffice.gov.uk"
    "someisp.com"       "john.smith@mail.someisp.com"
    "amazon.co.uk"      "trk@amazon.co.uk"
    "hatena.ne.jp"      "takashi@hatena.ne.jp"
    "hatena.ne.jp"      "takashi@mail.hatena.ne.jp"
    "ne.jp"             "takashi@www.ne.jp"))

(t/deftest ^:parallel domain-regex-on-urls-test
  (t/are [domain url] (= domain (re-find @#'mbql.jvm-u/domain-regex url))
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

(t/deftest ^:parallel domain-regex-on-emails-test
  (t/are [domain email] (= domain (re-find @#'mbql.jvm-u/domain-regex email))
    "metabase"   "braden@metabase.com"
    "homeoffice" "mholmes@homeoffice.gov.uk"
    "someisp"    "john.smith@mail.someisp.com"
    "amazon"     "trk@amazon.co.uk"
    "hatena"     "takashi@hatena.ne.jp"
    "ne"         "takashi@www.ne.jp"))

(t/deftest ^:parallel subdomain-regex-on-urls-test
  (t/are [subdomain url] (= subdomain (re-find @#'mbql.jvm-u/subdomain-regex url))
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

(t/deftest ^:parallel desugar-host-and-domain-test
  (t/is (= [:regex-match-first [:field 1 nil] (str @#'mbql.jvm-u/host-regex)]
           (mbql.u/desugar-expression [:host [:field 1 nil]]))
        "`host` should desugar to a `regex-match-first` clause with the host regex")
  (t/is (= [:regex-match-first [:field 1 nil] (str @#'mbql.jvm-u/domain-regex)]
           (mbql.u/desugar-expression [:domain [:field 1 nil]]))
        "`domain` should desugar to a `regex-match-first` clause with the domain regex")
  (t/is (= [:regex-match-first [:field 1 nil] (str @#'mbql.jvm-u/subdomain-regex)]
           (mbql.u/desugar-expression [:subdomain [:field 1 nil]]))
        "`subdomain` should desugar to a `regex-match-first` clause with the subdomain regex"))
