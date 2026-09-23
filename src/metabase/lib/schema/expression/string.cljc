(ns metabase.lib.schema.expression.string
  #?(:clj (:refer-clojure :exclude [doseq]))
  (:require
   #?(:clj [metabase.util.performance :refer [doseq]])
   [malli.util :as mut]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

(doseq [op [:trim :ltrim :rtrim :upper :lower]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Text
    [:schema [:ref ::expression/string]]))

(doseq [op [:host :domain :subdomain :path]]
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
  #_str     [:schema [:ref ::expression/string]]
  #_find    :string
  #_replace :string)

(mbql-clause/define-catn-mbql-clause :substring :- :type/Text
  [:str    [:schema [:ref ::expression/string]]]
  [:start  [:schema [:ref ::expression/integer]]]
  [:length [:? [:schema [:ref ::expression/integer]]]])

(mbql-clause/define-tuple-mbql-clause :split-part :- :type/Text
  #_text      [:schema [:ref ::expression/string]]
  #_delimiter [:string {:min 1}] ; literal string
  #_position  [:schema [:ref ::expression/positive-integer-or-numeric-expression]])

(mbql-clause/define-tuple-mbql-clause :collate :- :type/Text
  #_str [:schema [:ref ::expression/string]]
  #_collation :string)

(mbql-clause/define-catn-mbql-clause :concat :- :type/Text
  [:args [:repeat {:min 2} [:schema [:ref ::expression/expression]]]])

(def prompt-return-types
  "Values of `returnType => ...` on prompt()."
  #{:text :integer :float :boolean :date :datetime})

(mr/def ::prompt.named-args
  "Options on a `:prompt` clause beyond ::common/options. Users set them with `name => value` in a custom
  expression. Every prompt-specific option belongs here."
  [:map
   [:return-type {:optional true} (into [:enum {:decode/normalize common/normalize-keyword}] prompt-return-types)]
   [:json-schema {:optional true} [:string {:min 1 :max 16384}]]])

(mr/def ::prompt.options
  [:merge ::common/options ::prompt.named-args])

(def prompt-named-arg-keys
  "Keys of ::prompt.named-args."
  (set (mut/keys (mr/resolve-schema ::prompt.named-args))))

(mbql-clause/define-mbql-clause :prompt :- :type/Text
  [:cat
   {:error/message (str "Valid " :prompt " clause")}
   [:= {:decode/normalize common/normalize-keyword} :prompt]
   [:schema [:ref ::prompt.options]]
   [:+ [:schema [:ref ::expression/expression]]]])

(mbql-clause/define-tuple-mbql-clause :text :- :type/Text
  [:schema [:ref ::expression/expression]])
