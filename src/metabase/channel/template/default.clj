(ns metabase.channel.template.default
  (:require
   [clojure.java.io :as io]
   [medley.core :as m]))

;; email template

(def ^:private template-lookup
  {:channel/email (update-keys
                   {:bulk/create {:channel_type :channel/email
                                  :details      {:type    :email/handlebars-resource
                                                 :subject "Table {{table.name}} has a new row"
                                                 :path    "metabase/channel/email/data_editing_row_create.hbs"}}
                    :bulk/update {:channel_type :channel/email
                                  :details      {:type    :email/handlebars-resource
                                                 :subject "Table {{table.name}} has been updated"
                                                 :path    "metabase/channel/email/data_editing_row_update.hbs"}}
                    :bulk/delete {:channel_type :channel/email
                                  :details      {:type    :email/handlebars-resource
                                                 :subject "Table {{table.name}} has a row deleted"
                                                 :path    "metabase/channel/email/data_editing_row_delete.hbs"}}}
                   #(conj [:notification/system-event :event/action.success] %))
   :channel/slack (update-keys
                   {:bulk/create {:channel_type :channel/slack
                                  :details      {:type :slack/handlebars-text
                                                 :body (str "# {{editor.first_name}} {{editor.last_name}} has created a row for {{table.name}}"
                                                            "\n\n"
                                                            "## Created row:"
                                                            "\n\n"
                                                            "{{#each records}}\n"
                                                            "{{#each this.row}}\n"
                                                            "- {{@key}} : {{@value}}\n"
                                                            "{{/each}}\n"
                                                            "{{/each}}")}}
                    :bulk/update {:channel_type :channel/slack
                                  :details      {:type :slack/handlebars-text
                                                 :body (str "# {{editor.first_name}} {{editor.last_name}} has updated a row from {{table.name}}\n\n"
                                                            "\n\n"
                                                            "## Update:"
                                                            "\n\n"
                                                            "{{#each records}}\n"
                                                            "{{#each this.changes}}\n"
                                                            "- {{@key}} : {{@value.after}}\n"
                                                            "{{/each}}\n"
                                                            "{{/each}}")}}
                    :bulk/delete {:channel_type :channel/slack
                                  :details      {:type :slack/handlebars-text
                                                 :body (str "# {{editor.first_name}} {{editor.last_name}} has deleted a row from {{table.name}}"
                                                            "\n\n"
                                                            "## Deleted row:"
                                                            "\n\n"
                                                            "{{#each records}}\n"
                                                            "{{#each this.row}}\n"
                                                            "- {{@key}} : {{@value}}\n"
                                                            "{{/each}}\n"
                                                            "{{/each}}")}}}
                   #(conj [:notification/system-event :event/action.success] %))})

;; TODO this should be a multimethod
(defn- resolve-template
  [{:keys [details] :as template}]
  (let [template-type (keyword (:type details))]
    (case template-type
      (:email/handlebars-resource :slack/handlebars-resource)
      (-> template
          (assoc-in [:details :body] (-> (:path details) io/resource slurp))
          (assoc-in [:details :type] (if (= template-type :email/handlebars-resource)
                                       :email/handlebars-text
                                       :slack/handlebars-text))
          (m/dissoc-in [:details :path]))
      template)))

;; we should rethink how this path, maybe we need to have some kind of template-id
(defn- notification-info->path
  [payload-type payload]
  [payload-type (:event_name payload) (:action payload)])

(defn default-template
  "Given a notification info, return the template to use for the channel type."
  [payload-type payload channel-type]
  (some-> (get template-lookup channel-type)
          (get (notification-info->path payload-type payload))
          resolve-template))
