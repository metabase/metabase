(ns metabase.lib.schema.expression.string
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

(doseq [op [:trim :ltrim :rtrim :upper :lower]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Text
    [:schema [:ref ::expression/string]]))

(doseq [op [:host :domain :subdomain :url-pathname]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Text
    [:schema [:ref ::expression/string]]))

(doseq [op [:month-name :quarter-name :day-name]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Text
    [:schema [:ref ::expression/integer]]))

(mbql-clause/define-tuple-mbql-clause :length :- :type/Integer
  [:schema [:ref ::expression/string]])

;;; `regex-match-first` is called `regexextract` in the FE QB expression editor. See
;;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1721158713517859
(mbql-clause/define-tuple-mbql-clause :regex-match-first :- :type/Text
  #_str [:schema [:ref ::expression/string]]
  ;; TODO regex type?
  #_regex [:schema [:ref ::expression/string]])

(mbql-clause/define-tuple-mbql-clause :replace :- :type/Text
  #_str [:schema [:ref ::expression/string]]
  #_find [:schema [:ref ::expression/string]]
  #_replace [:schema [:ref ::expression/string]])

(mbql-clause/define-catn-mbql-clause :substring :- :type/Text
  [:str [:schema [:ref ::expression/string]]]
  [:start [:schema [:ref ::expression/integer]]]
  [:length [:? [:schema [:ref ::expression/integer]]]])

(mbql-clause/define-catn-mbql-clause :concat :- :type/Text
  [:args [:repeat {:min 2} [:schema [:ref ::expression/expression]]]])

(mbql-clause/define-tuple-mbql-clause :split :- :type/Text
  [:schema [:ref ::expression/string]]
  [:schema [:ref ::expression/string]]
  [:schema [:ref ::expression/integer]])

#_(mbql-clause/define-tuple-mbql-clause :cast :- :type/*
    [:schema :any]
    [:schema [:ref ::expression/string]])

(mr/def ::mbql-type
  [:enum "Integer" "Text" "Date"])

(mbql-clause/define-mbql-clause :cast (mbql-clause/tuple-clause-schema :cast
                                                                       [:schema :any]
                                                                       [:schema [:ref ::mbql-type]]))
(defmethod expression/type-of-method :cast
  [[_cast opts _field cast-to-type]]
  (keyword "type" cast-to-type))
