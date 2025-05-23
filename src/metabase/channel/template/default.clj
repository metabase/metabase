(ns metabase.channel.template.default
  (:require
   [clojure.java.io :as io]
   [medley.core :as m]))

(def ^:private default-http-template
  {:channel_type :channel/http
   :details      {:type :http/handlebars-text
                  :body "{{{json-encode .}}}"}})

(def ^:private template-lookup
  {:channel/email {[:notification/system-event :event/row.created] {:channel_type :channel/email
                                                                    :details      {:type    :email/handlebars-resource
                                                                                   :subject "A new record was added to \"{{table.name}}\" by {{editor.common_name}}"
                                                                                   :path    "metabase/channel/email/data_editing_row_create.hbs"}}
                   [:notification/system-event :event/row.updated] {:channel_type :channel/email
                                                                    :details      {:type    :email/handlebars-resource
                                                                                   :subject "A record was updated in \"{{table.name}}\" by {{editor.common_name}}"
                                                                                   :path    "metabase/channel/email/data_editing_row_update.hbs"}}
                   [:notification/system-event :event/row.deleted] {:channel_type :channel/email
                                                                    :details      {:type    :email/handlebars-resource
                                                                                   :subject "A record was deleted from \"{{table.name}}\" by {{editor.common_name}}"
                                                                                   :path    "metabase/channel/email/data_editing_row_delete.hbs"}}}
   :channel/slack {[:notification/system-event :event/row.created] {:channel_type :channel/slack
                                                                    :details      {:type :slack/handlebars-text
                                                                                   :body (str "*A new record was _created_* in <{{table.url}}|Table {{table.name}}>{{#if editor.common_name }} by {{editor.common_name}}{{/if}}.\n"
                                                                                              "{{#each record}}"
                                                                                              "• *{{{@key}}}*: {{{@value}}}\n"
                                                                                              "{{/each}}")}}
                   [:notification/system-event :event/row.updated] {:channel_type :channel/slack
                                                                    :details      {:type :slack/handlebars-text
                                                                                   :body (str "*A record was _updated_* in <{{table.url}}|Table {{table.name}}>{{#if editor.common_name }} by {{editor.common_name}}{{/if}}\n"
                                                                                              "*Changed Fields*\n"
                                                                                              "{{#each changes}}"
                                                                                              "• *{{{@key}}}*: ~{{{@value.before}}}~ → {{{@value.after}}}\n"
                                                                                              "{{/each}}\n"
                                                                                              "*Current Record Details*\n"
                                                                                              "{{#each record}}"
                                                                                              "• *{{{@key}}}*: {{{@value}}}\n"
                                                                                              "{{/each}}")}}
                   [:notification/system-event :event/row.deleted] {:channel_type :channel/slack
                                                                    :details      {:type :slack/handlebars-text
                                                                                   :body (str "*A record was _deleted_* in <{{table.url}}|Table {{table.name}}>{{#if editor.common_name }} by {{editor.common_name}}{{/if}}.\n"
                                                                                              "{{#each record}}"
                                                                                              "• ~*{{{@key}}}*~: {{{@value}}}\n"
                                                                                              "{{/each}}\n"
                                                                                              "This record is no longer available")}}
                   [:notification/card nil] {:channel_type :channel/slack
                                             :details      {:type :slack/handlebars-text
                                                            :body "<{{card-url card.id}}|{{card.name}}>"}}}
   :channel/http {[:notification/system-event :event/row.created] default-http-template
                  [:notification/system-event :event/row.updated] default-http-template
                  [:notification/system-event :event/row.deleted] default-http-template}})

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

;; TODO: rethink this path, maybe we need to have some kind of template-id
(defn- notification-info->path
  [payload-type payload]
  [payload-type (:event_name payload)])

;; TODO: rework this signature this hsould be a multimethod
(defn default-template
  "Given a notification info, return the template to use for the channel type."
  [payload-type payload channel-type]
  (some-> (get template-lookup channel-type)
          (get (notification-info->path payload-type payload))
          resolve-template))
