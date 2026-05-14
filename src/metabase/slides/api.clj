(ns metabase.slides.api
  "`/api/slides/` route assembly."
  (:require
   [metabase.api.util.handlers :as handlers]
   [metabase.slides.api.generate]
   [metabase.slides.api.slides]))

(comment metabase.slides.api.generate/keep-me
         metabase.slides.api.slides/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "`/api/slides/` routes."
  (handlers/routes
   metabase.slides.api.generate/routes
   metabase.slides.api.slides/routes))
