(ns metabase.driver.common.parameters.parse-param
  (:require
   [clojure.core.match :refer [match]]
   [instaparse.core :as insta]
   [metabase.driver.common.parameters :as params]))

(insta/defparser ^:private param-grammar "
S = <whitespace> function/param <whitespace>
param = #'.*'
expr = string|doubleString
string = <'\\''> #'[^\\']*' <'\\''>
doubleString = <'\"'> #'[^\"]*' <'\"'>
function = functionName arglist
functionName = 'mb.' #'[\\w_\\d\\.]+'
arglist = <'('> <whitespace> expr? <whitespace> (<','> <whitespace> expr <whitespace>)* <')'>
whitespace = #'\\s*'
")

(defn- parse-expr [expr]
  (match expr
    [:expr [:string s]] s
    [:expr [:doubleString s]] s))

(defn parse-param
  "Parses the contents of a {{blah}} param in a native query.  Returns a map with the keys [:type, :name, and
  optionally :args]"
  [s]
  (match (param-grammar s)
    [:S [:function [:functionName prefix name] [:arglist & args]]] (params/->FunctionParam (str prefix name) (mapv parse-expr args))
    [:S [:param name]] (params/->Param name)))
