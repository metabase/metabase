(ns metabase.lib.schema.expression.string
  (:require
    [metabase.lib.schema.expression :as expression]
    [metabase.lib.schema.mbql-clause :as mbql-clause]))

(doseq [op [:trim :ltrim :rtrim :upper :lower]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Text
    [:schema [:ref ::expression/string]]))

(mbql-clause/define-tuple-mbql-clause :length :- :type/Integer
  [:schema [:ref ::expression/string]])

(mbql-clause/define-tuple-mbql-clause :regexextract :- :type/Text
  #_str [:schema [:ref ::expression/string]]
  ;; TODO regex type?
  #_regex [:schema [:ref ::expression/string]])

(mbql-clause/define-tuple-mbql-clause :replace :- :type/Text
  #_str [:schema [:ref ::expression/string]]
  #_find [:schema [:ref ::expression/string]]
  #_replace [:schema [:ref ::expression/string]])

(mbql-clause/define-tuple-mbql-clause :substring :- :type/Text
  #_str [:schema [:ref ::expression/string]]
  #_start [:schema [:ref ::expression/integer]]
  #_end [:schema [:ref ::expression/integer]])

(mbql-clause/define-catn-mbql-clause :concat :- :type/Text
  [:args [:repeat {:min 2} [:schema [:ref ::expression/string]]]])
