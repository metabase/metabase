(ns metabase.channel.template.core
  (:require
   [metabase.channel.template.default :as channel.default]
   [metabase.channel.template.handlebars :as channel.handlebars]
   [metabase.util.log :as log]
   [potemkin :as p]))

(p/import-vars
 [channel.handlebars
  render-string
  render
  humanize-error-message]
 [channel.default
  default-template])

(defn render-template
  "Render a template with a payload."
  [{:keys [details] :as _template} context]
  (case (keyword (:type details))
    (:email/handlebars-resource :slack/handlebars-resource)
    (render (:path details) context)

    (:email/handlebars-text :slack/handlebars-text :http/handlebars-text)
    (render-string (:body details) context)

    (do
      (log/warnf "Unknown email template type: %s" (:type details))
      nil)))
