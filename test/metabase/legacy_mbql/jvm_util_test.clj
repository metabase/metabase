(ns metabase.legacy-mbql.jvm-util-test
  {:clj-kondo/config '{:linters {:deprecated-var {:level :off}}}}
  (:require
   [clojure.test :as t]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.filter.desugar.jvm :as lib.filter.desugar.jvm]))

(t/deftest ^:parallel desugar-host-and-domain-test
  (t/is (= [:regex-match-first [:field 1 nil] (str @#'lib.filter.desugar.jvm/host-regex)]
           (mbql.u/desugar-expression [:host [:field 1 nil]]))
        "`host` should desugar to a `regex-match-first` clause with the host regex")
  (t/is (= [:regex-match-first [:field 1 nil] (str @#'lib.filter.desugar.jvm/domain-regex)]
           (mbql.u/desugar-expression [:domain [:field 1 nil]]))
        "`domain` should desugar to a `regex-match-first` clause with the domain regex")
  (t/is (= [:regex-match-first [:field 1 nil] (str @#'lib.filter.desugar.jvm/subdomain-regex)]
           (mbql.u/desugar-expression [:subdomain [:field 1 nil]]))
        "`subdomain` should desugar to a `regex-match-first` clause with the subdomain regex")
  (t/is (= [:regex-match-first [:field 1 nil] (str @#'lib.filter.desugar.jvm/path-regex)]
           (mbql.u/desugar-expression [:path [:field 1 nil]]))
        "`path` should desugar to a `regex-match-first` clause with the path regex"))
