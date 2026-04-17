(ns metabase.flarg.joke-of-the-day.routes
  "Flarg-side impl of the [[metabase.api-routes.routes/joke-of-the-day-routes]] seam. Only on the
  classpath when the `:flarg/joke-of-the-day` alias is active. Registering this impl causes the
  main-side [[metabase.api-routes.routes/joke-of-the-day-routes]] dispatcher to return the route
  map entry that mounts `metabase.flarg.joke-of-the-day.api` under `/joke-of-the-day`."
  (:require
   [metabase.flargs.core :as flargs]))

(flargs/defflarg joke-of-the-day-routes
  "Route contribution for the joke-of-the-day flarg."
  :flarg/joke-of-the-day
  metabase.flarg.joke-of-the-day.routes
  []
  {"/joke-of-the-day" 'metabase.flarg.joke-of-the-day.api})
