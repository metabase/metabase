(ns metabase.lib.filter.desugar.jvm
  "This namespace contains functionality that is not compatible with js."
  (:require
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util.malli :as mu]
   [metabase.util.regex :as u.regex]))

;;;; Following regex definitions are incompatible with Safari browser. Code is unused on FE.

(def ^:private optional-www
  "Optional `www.` prefix (ignored)"
  [:optional-possessive #"www\."])

(def ^:private domain-char              #"[^@\.:/?#]")
(def ^:private one-or-more-domain-chars [:one-or-more domain-char])

(def ^:private url-prefix
  [:or
   ;; ^[^@]*@ → Matches email-style: user@domain.com
   #"^[^@]*@"
   ;; ^[^/]*/+ → Matches protocols: https://domain.com
   #"^[^/]*/+"
   ;; ^ → Matches bare domains: domain.com
   #"^"])

(def ^:private subdomains-lazy
  "Match subdomains (lazy)."
  [:zero-or-more-non-greedy
   [:non-capturing-group
    one-or-more-domain-chars
    #"\."]])

(def ^:private main-domain
  "The main domain name (excluding special chars: `@.:/?#`)"
  one-or-more-domain-chars)

(def ^:private top-level-domain
  [:or
   ;; First alternative: .co.uk style (compound TLD with 1-3 char middle part)
   [:and [:range domain-char 1 3] #"\." one-or-more-domain-chars]
   ;; Second alternative: .com style (simple TLD)
   one-or-more-domain-chars])

(def ^:private start-of-port-or-path
  [:or #"[:/?#]" #"$"])

(def host-regex
  "Extracts the \"host\" from a URL or an email. By host we mean the main domain name and the TLD, eg. `metabase.com`,
  `amazon.co.jp`, `bbc.co.uk`. For a URL, this is not the RFC3986 \"host\", which would include any subdomains and the
  optional `:3000` port number.

  For an email, this is generally the part after the @, but it will skip any subdomains:

    someone@email.mycompany.net -> mycompany.net"
  (u.regex/rx
   url-prefix
   optional-www
   subdomains-lazy
   [:capturing-group
    main-domain
    #"\."
    top-level-domain]
   start-of-port-or-path))

(def domain-regex
  "Deliberately no ^ at the start; there might be several subdomains before this spot. By \"short tail\" below, I mean a
  pseudo-TLD nested under a proper TLD. For example, `mycompany.co.uk`.

  This can accidentally capture a short domain name, eg.

    \"subdomain.aol.com\" -> \"subdomain\"

  , oops. But there's a load of these, not a short list we can include here, so it's either preprocess the (huge)
  master list from Mozilla or accept that this regex is a bit best-effort."
  (u.regex/rx
   url-prefix
   optional-www
   subdomains-lazy
   [:capturing-group main-domain]
   #"\."
   top-level-domain
   start-of-port-or-path))

(def subdomain-regex
  "This grabs the first segment that isn't `www`, AND excludes the main domain name. See [[domain-regex]] for more
  details about how those are matched.

  Referencing the indexes below:

  1. Positive lookbehind: Just past one of:

  2. `@` from an email or URL `userinfo@` prefix

  3. `//` from a URL scheme

  4. `.` from a previous subdomain segment

  5. Start of string

  6. Negative lookahead: don't capture `www` as the domain

  7. Negative lookahead: don't capture the main domain name or part of the TLD That would look like:

  8. The next segment we *would* capture as the subdomain

  9. Optional short segment, like `co` in `.co.uk`

  10. Top-level domain

  11. Optionally more URL things: `:port` or `/path` or `?query` or `#fragment`

  12. End of string

  13. Match the actual subdomain

  14. Positive lookahead: the . after the subdomain, which we want to detect but not capture."
  ;;1   2 3  4  5 6        7  8           9                    10        11           12 13       14
  #"(?<=@|//|\.|^)(?!www\.)(?![^\.:/?#]+\.(?:[^\.:/?#]{1,3}\.)?[^\.:/?#]+(?:[:/?#].*)?$)[^\.:/?#]+(?=\.)")

(def path-regex
  "This regex is just a hack. It's actually really hard to just match the path with a regex.

  This will match:

  - `google.com/`

  - `google.com/abc`

  - `google.com/abc?hjfds`"
  (u.regex/rx
   #"\."
   [:range #"[^/:?#]" 1 10]
   [:capturing-group
    #"/[^#?]*"]))

(mu/defn desugar-host-and-domain :- ::lib.schema.mbql-clause/clause
  "Unwrap host and domain."
  [expression :- ::lib.schema.mbql-clause/clause]
  (lib.util.match/replace expression
    [:host opts expr]
    ;; TODO (Cam 8/18/25) -- seems weird that we don't support Regex literals in the regex clauses and have to call (str ...)
    (recur [:regex-match-first opts expr (str host-regex)])

    [:domain opts expr]
    (recur [:regex-match-first opts expr (str domain-regex)])

    [:subdomain opts expr]
    (recur [:regex-match-first opts expr (str subdomain-regex)])

    [:path opts expr]
    (recur [:regex-match-first opts expr (str path-regex)])))
