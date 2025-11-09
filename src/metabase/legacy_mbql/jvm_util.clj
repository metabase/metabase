(ns metabase.legacy-mbql.jvm-util
  "This namespace contains functionality that is not compatible with js, hence can not be stored in corresponding
  cljc ns, ie. [[metabase.legacy-mbql.util]]."
  {:deprecated "0.57.0"}
  (:require
   [metabase.lib.filter.desugar.jvm :as lib.filter.desugar.jvm]
   [metabase.lib.util.match :as lib.util.match]))

(defn desugar-host-and-domain
  "Unwrap host and domain."
  {:deprecated "0.57.0"}
  [expression]
  (lib.util.match/replace
    expression
    [:host column]
    (recur [:regex-match-first column (str lib.filter.desugar.jvm/host-regex)])
    [:domain column]
    (recur [:regex-match-first column (str lib.filter.desugar.jvm/domain-regex)])
    [:subdomain column]
    (recur [:regex-match-first column (str lib.filter.desugar.jvm/subdomain-regex)])
    [:path column]
    (recur [:regex-match-first column (str lib.filter.desugar.jvm/path-regex)])))
