(ns metabase.driver.common.parameters.parse-param
  (:require
   [clojure.core.match :refer [match]]
   [instaparse.core :as insta]
   [metabase.driver.common.parameters :as params]))

(insta/defparser param-grammar "
S = function|name
expr = string|doubleString
string = <'\\''> #'[^\\']*' <'\\''>
doubleString = <'\"'> #'[^\"]*' <'\"'>
function = name arglist
name = #'[\\w_\\.#-]+'
arglist = <'('> <whitespace> expr? <whitespace> (<','> <whitespace> expr <whitespace>)* <')'>
whitespace = #'\\s*'
")

(defn- parse-expr [expr]
  (match expr
    [:expr [:string s]] s
    [:expr [:doubleString s]] s))

(defn parse-param [s]
  (match (param-grammar s)
    [:S [:function [:name name] [:arglist & args]]] (params/->FunctionParam name (mapv parse-expr args))
    [:S [:name name]] (params/->Param name)))
