(ns metabase.util.schema
  "Various schemas that are useful throughout the app."
  (:require [clojure.string :as str]
            [schema.core :as s]
            metabase.types
            [metabase.util :as u]))

(def NonBlankString
  "Schema for a string that cannot be blank."
  (s/constrained s/Str (complement str/blank?) "Non-blank string"))

(def IntGreaterThanZero
  "Schema representing an integer than must also be greater than zero."
  (s/constrained s/Int (partial < 0) "Integer greater than zero"))

(def KeywordOrString
  "Schema for something that can be either a `Keyword` or a `String`."
  (s/named (s/cond-pre s/Keyword s/Str) "Keyword or string"))

(def FieldType
  "Is this a valid Field type (does it derive from `:type/*`?"
  (s/pred (u/rpartial isa? :type/*) "Valid type"))
