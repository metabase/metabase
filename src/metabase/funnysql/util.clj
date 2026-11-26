(ns metabase.funnysql.util
  "Builders of Funny SQL forms for app-DB queries."
  (:require
   [clojure.string :as str]
   [metabase.funnysql.schema :as funnysql.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn- escape-like-pattern :- :string
  "Escape `%`, `_` and the escape character `!` so `s` matches literally in a `LIKE` pattern."
  [s :- :string]
  (str/replace s #"([!%_])" "!$1"))

(mu/defn like-pattern :- ::funnysql.schema/call.escape
  "`LIKE` right-hand side matching `s` literally, with an explicit `ESCAPE` clause so it behaves the same on every app DB;
  `wrap` receives the escaped string and returns the final pattern."
  ([s :- :string]
   (like-pattern s identity))
  ([s    :- :string
    wrap :- fn?]
   [:escape (wrap (escape-like-pattern s)) "!"]))

(mu/defn like-substring :- ::funnysql.schema/call.escape
  "`LIKE` right-hand side matching `s` case-insensitively as a literal substring; compare it against a lowercased column."
  [s :- :string]
  (like-pattern (u/lower-case-en s) #(str "%" % "%")))

(mu/defn like-prefix :- ::funnysql.schema/call.escape
  "`LIKE` right-hand side matching `s` case-insensitively as a literal prefix; compare it against a lowercased column."
  [s :- :string]
  (like-pattern (u/lower-case-en s) #(str % "%")))
