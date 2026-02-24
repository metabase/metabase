(ns metabase.joke-of-the-day.api
  "/api/joke-of-the-day endpoint."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.joke-of-the-day.jokes :as jokes]
   [metabase.release-flags.core :as flags]))

(api.macros/defendpoint :get "/" :- [:map
                                     [:id :int]
                                     [:type :string]
                                     [:setup :string]
                                     [:punchline :string]]
  "Return the joke of the day."
  []
  (when (flags/has-release-flag? :joke-of-the-day)
    (rand-nth (jokes/jokes))))
