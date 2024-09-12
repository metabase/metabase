(ns metabase.channel.params
  (:require
   [stencil.core :as stencil]))

(defn substitute-params
  "Substitute parameters in text with values from context.

  Params are specified using mustache syntax, e.g. {{param}}."
  [template-src data-map]
  (stencil/render-string template-src data-map))

(comment
  (substitute-params "Hello {{user.email}}!" {:user {:email "ngoc@metabase.com"}}))
