(ns metabase.legacy-mbql.jvm-util
  "This namespace contains functionality that is not compatible with js, hence can not be stored in correspoding
  cljc ns, ie. [[metabase.legacy-mbql.util]]."
  (:require
   [metabase.lib.util.match :as lib.util.match]))

;;;; Following regex definitions are incompatible with Safari browser. Code is unused on FE.

(def ^:private host-regex
  ;; Extracts the "host" from a URL or an email.
  ;; By host we mean the main domain name and the TLD, eg. metabase.com, amazon.co.jp, bbc.co.uk.
  ;; For a URL, this is not the RFC3986 "host", which would include any subdomains and the optional `:3000` port number.
  ;;
  ;; For an email, this is generally the part after the @, but it will skip any subdomains:
  ;;   someone@email.mycompany.net -> mycompany.net
  ;;
  ;; Referencing the indexes below:
  ;; 1.  Positive lookbehind:
  ;;       Just past one of:
  ;; 2.      @  from an email or URL userinfo@ prefix
  ;; 3.      // from a URL scheme
  ;; 4.      .  from a previous subdomain segment
  ;; 5.      Start of string
  ;; 6.  Negative lookahead: don't capture www as part of the domain
  ;; 7.  Main domain segment
  ;; 8.  Ending in a dot
  ;; 9.  Optional short final segment (eg. co in .co.uk)
  ;; 10. Top-level domain
  ;; 11. Optional :port, /path, ?query or #hash
  ;; 12. Anchor to the end
  ;;1   2 3  4  5 6        7          8 9                     10         11           12
  #"(?<=@|//|\.|^)(?!www\.)[^@\.:/?#]+\.(?:[^@\.:/?#]{1,3}\.)?[^@\.:/?#]+(?=[:/?#].*$|$)")

(def ^:private domain-regex
  ;; Deliberately no ^ at the start; there might be several subdomains before this spot.
  ;; By "short tail" below, I mean a pseudo-TLD nested under a proper TLD. For example, mycompany.co.uk.
  ;; This can accidentally capture a short domain name, eg. "subdomain.aol.com" -> "subdomain", oops.
  ;; But there's a load of these, not a short list we can include here, so it's either preprocess the (huge) master list
  ;; from Mozilla or accept that this regex is a bit best-effort.
  ;; Referencing the indexes below:
  ;; 1.  Positive lookbehind:
  ;;       Just past one of:
  ;; 2.      @  from an email or URL userinfo@ prefix
  ;; 3.      // from a URL scheme
  ;; 4.      .  from a previous subdomain segment
  ;; 5.      Start of string
  ;; 6.  Negative lookahead: don't capture www as the domain
  ;; 7.  One domain segment
  ;; 8.  Positive lookahead:
  ;;       Either:
  ;; 9.      Short final segment (eg. .co.uk)
  ;; 10.     Top-level domain
  ;; 11.     Optional :port, /path, ?query or #hash
  ;; 12.     Anchor to end
  ;;       Or:
  ;; 13.     Top-level domain
  ;; 14.     Optional :port, /path, ?query or #hash
  ;; 15.     Anchor to end
  ;;1   2 3  4  5 6        7          (8   9                10         11          12|  13         14           15)
  #"(?<=@|//|\.|^)(?!www\.)[^@\.:/?#]+(?=\.[^@\.:/?#]{1,3}\.[^@\.:/?#]+(?:[:/?#].*)?$|\.[^@\.:/?#]+(?:[:/?#].*)?$)")

(def ^:private subdomain-regex
  ;; This grabs the first segment that isn't "www", AND excludes the main domain name.
  ;; See [[domain-regex]] for more details about how those are matched.
  ;; Referencing the indexes below:
  ;; 1.  Positive lookbehind:
  ;;       Just past one of:
  ;; 2.      @  from an email or URL userinfo@ prefix
  ;; 3.      // from a URL scheme
  ;; 4.      .  from a previous subdomain segment
  ;; 5.      Start of string
  ;; 6.  Negative lookahead: don't capture www as the domain
  ;; 7.  Negative lookahead: don't capture the main domain name or part of the TLD
  ;;       That would look like:
  ;; 8.      The next segment we *would* capture as the subdomain
  ;; 9.      Optional short segment, like "co" in .co.uk
  ;; 10.     Top-level domain
  ;; 11.     Optionally more URL things: :port or /path or ?query or #fragment
  ;; 12.     End of string
  ;; 13. Match the actual subdomain
  ;; 14. Positive lookahead: the . after the subdomain, which we want to detect but not capture.
  ;;1   2 3  4  5 6        7  8           9                    10        11           12 13       14
  #"(?<=@|//|\.|^)(?!www\.)(?![^\.:/?#]+\.(?:[^\.:/?#]{1,3}\.)?[^\.:/?#]+(?:[:/?#].*)?$)[^\.:/?#]+(?=\.)")

(defn desugar-host-and-domain
  "Unwrap host and domain."
  [expression]
  (lib.util.match/replace
   expression
   [:host column]
   (recur [:regex-match-first column (str host-regex)])
   [:domain column]
   (recur [:regex-match-first column (str domain-regex)])
   [:subdomain column]
   (recur [:regex-match-first column (str subdomain-regex)])))
