(ns metabase.lib.parse-param
  (:require
   [clojure.core.match :refer [match]]
   [instaparse.core :as insta]))

(insta/defparser ^:private param-grammar "
S = (<whitespace> function <whitespace>) / param
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
    [:S [:function
         [:functionName prefix function-name]
         [:arglist & args]]] {:type :metabase.lib.parse/function-param
                              :name (str prefix function-name)
                              :args (mapv parse-expr args)}
    [:S [:param param-name]] {:type :metabase.lib.parse/param
                              :name param-name}))
