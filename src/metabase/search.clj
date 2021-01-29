(ns metabase.search
  (:require [clojure.string :as str]
            [schema.core :as s]))

(s/defn tokenize :- [s/Str]
  "Break a search `query` into its constituent tokens"
  [query :- s/Str]
  (filter seq
          (str/split query #"\s+")))
