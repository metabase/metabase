(ns metabase.channel.template.core
  (:require
   [metabase.channel.template.handlebars :as channel.handlebars]
   [potemkin :as p]))

(p/import-vars
 [channel.handlebars
  render-string
  render])
