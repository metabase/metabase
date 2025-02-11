(ns metabase.channel.template.core
  (:require
   [metabase.channel.template.handlebars :as channel.handlebars]
   [metabase.util.log :as log]
   [potemkin :as p]))

(p/import-vars
 [channel.handlebars
  render-string
  render])

(defn render-template
  "Render a template with a payload."
  [{:keys [details] :as _template} payload]
  (case (keyword (:type details))
    :email/handlebars-resource
    (render (:path details) payload)

    :email/handlebars-text
    (render-string (:body details) payload)

    (do
      (log/warnf "Unknown email template type: %s" (:type details))
      nil)))
