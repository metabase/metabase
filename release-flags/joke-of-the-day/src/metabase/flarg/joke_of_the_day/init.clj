(ns metabase.flarg.joke-of-the-day.init
  "Loads the joke-of-the-day flarg's namespaces so its defflarg impls register and any
  side-effecting forms fire."
  (:require
   [metabase.flarg.joke-of-the-day.api]
   [metabase.flarg.joke-of-the-day.routes]))
