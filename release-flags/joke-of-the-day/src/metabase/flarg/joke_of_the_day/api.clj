(ns metabase.flarg.joke-of-the-day.api
  "/api/joke-of-the-day endpoint. Only on the classpath when the `:flarg/joke-of-the-day` alias is
  active — classpath presence is the gate, so no runtime release-flag check is needed here."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.flarg.joke-of-the-day.jokes :as jokes]))

(api.macros/defendpoint :get "/" :- [:map
                                     ["id" :int]
                                     ["type" :string]
                                     ["setup" :string]
                                     ["punchline" :string]]
  "Return the joke of the day."
  []
  (rand-nth (jokes/jokes)))
