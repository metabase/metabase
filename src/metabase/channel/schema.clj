(ns metabase.channel.schema
  "Malli schemas for the channel module."
  (:require
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.config.core :as config]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::http-details
  "The connection `:details` of a `:channel/http` channel."
  [:map {:closed true}
   [:url                           ms/Url]
   [:auth-method                   [:enum "none" "header" "query-param" "request-body"]]
   [:auth-info    {:optional true} (ms/string-keyed-map :string)]
   [:fe-form-type {:optional true} [:enum "api-key" "bearer" "basic" "none"]]
   [:method       {:optional true} [:enum "get" "post" "put"]]])

(mr/def ::slack-details
  "The connection `:details` of a `:channel/slack` channel."
  [:map {:closed true}
   [:channel :string]])

(mr/def ::email-details
  "The connection `:details` of a `:channel/email` channel: there are none, email is configured by settings."
  [:map {:closed true}])

(mr/def ::test-details
  "The `:details` of the test-only `:channel/metabase-test` channel, which exists so a test can drive a connection test
  down each of its branches. `metabase.notification.test-util`'s `can-connect?` reads `:return-type` and then either
  returns `:return-value` or throws with it as `ex-data`, so what `:return-value` may be depends on which:

  - `\"return-value\"` -- the boolean `can-connect?` returns. `true` is the success branch (`{:ok true}`); `false` is
    the failure one, echoed back as the 400's `{:connection-result false}`.
  - `\"throw\"` -- the `ex-data` of the thrown exception, which the endpoint hands back as the 400's `:data`. The
    field-keyed error map a connection check reports a bad detail with, as in `{:errors {:email \"Invalid email\"}}`."
  [:multi {:dispatch #(get % :return-type "unset")}
   ["unset"        [:map {:closed true}]]
   ["return-value" [:map {:closed true}
                    [:return-type  [:= "return-value"]]
                    [:return-value :boolean]]]
   ["throw"        [:map {:closed true}
                    [:return-type  [:= "throw"]]
                    [:return-value [:map {:closed true}
                                    [:errors [:map {:closed true}
                                              [:email {:optional true} :string]]]]]]]])

(def channel-type->details-schema
  "The details schema of each channel type. The test channel is only a channel in the test JVM."
  (cond-> {:channel/http  ::http-details
           :channel/slack ::slack-details
           :channel/email ::email-details}
    config/is-test? (assoc :channel/metabase-test ::test-details)))

(mr/def ::channel.details
  "The `:details` column of a Channel, decoded, when the channel's `:type` is not at hand to pick the schema by. Decoding
  an `:or` keeps the first branch the value satisfies once decoded, and the request decoder strips undeclared keys, so
  the branches run from the most to the least demanding: the empty `::email-details` would swallow anything."
  (into [:or]
        (keep channel-type->details-schema)
        [:channel/metabase-test :channel/slack :channel/http :channel/email]))

(defn details-by-type
  "A `:multi` schema on a channel's `:type` whose branches each declare that type's `:details`, for `:merge`ing into a
  channel schema: Malli pushes the merge into every branch, so the branch's `:details` entry lands in the closed map
  alongside the other columns. An email channel has no details to speak of, so its entry is optional."
  [& {:keys [details-optional?]}]
  (into [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
                 :dispatch         (fn [channel]
                                     (let [channel-type (some-> (:type channel) keyword)]
                                       (when (and channel-type (= "channel" (namespace channel-type)))
                                         channel-type)))}]
        (for [[channel-type details-schema] channel-type->details-schema]
          [channel-type [:map {:closed true}
                         (if (or details-optional? (= channel-type :channel/email))
                           [:details {:optional true} [:maybe details-schema]]
                           [:details details-schema])]])))

(mr/def ::channel.details-by-type
  "[[details-by-type]] as a schema, for the row schemas below."
  (details-by-type))

(mr/def ::channel
  "A Channel as selected from the app DB: every column of `:channel`."
  [:merge
   [:map {:closed true}
    [:id          ms/PositiveInt]
    [:name        :string]
    [:description [:maybe :string]]
    [:type        [:or :keyword :string]]
    [:active      :boolean]
    [:created_at  ms/TemporalInstant]
    [:updated_at  ms/TemporalInstant]]
   ::channel.details-by-type])

(mr/def ::channel.update
  "What an update (or insert) of a Channel accepts: every column of `:channel` except `id`, all optional."
  [:map {:closed true}
   [:name        {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:type        {:optional true} [:maybe [:or :keyword :string]]]
   [:details     {:optional true} [:maybe ::channel.details]]
   [:active      {:optional true} [:maybe :boolean]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at  {:optional true} [:maybe ms/TemporalInstant]]])

(def channel-template-details-types
  "The `:type`s an email template's details can have: a Handlebars template written inline, or one shipped as a resource."
  #{:email/handlebars-text
    :email/handlebars-resource})

(mr/def ::channel-template.email-details
  "The `:details` of a `:channel/email` ChannelTemplate."
  [:merge
   [:map {:closed true}
    [:type                            (apply ms/enum-keywords-and-strings channel-template-details-types)]
    [:subject                         string?]
    [:recipient-type {:optional true} (ms/enum-keywords-and-strings :cc :bcc)]]
   [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
            :dispatch         (comp keyword :type)}
    [:email/handlebars-resource
     [:map {:closed true}
      [:path [:and
              string?
              [:fn {:error/message "invalid template path"}
               handlebars/valid-template-name?]]]]]
    [:email/handlebars-text
     [:map {:closed true}
      [:body string?]]]]])

(mr/def ::channel-template.email-details.user-provided
  "Email template details as the API accepts them. Only an inline Handlebars template is allowed; a resource template is
  for internal use."
  [:map {:closed true}
   [:type    (ms/enum-keywords-and-strings :email/handlebars-text)]
   [:subject string?]
   [:recipient-type {:optional true} (ms/enum-keywords-and-strings :cc :bcc)]
   [:body    string?]])

(mr/def ::channel-template.details
  "The `:details` column of a ChannelTemplate, decoded. Only email templates exist."
  ::channel-template.email-details)

(mr/def ::channel-template
  "A ChannelTemplate as selected from the app DB: every column of `:channel_template`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:name         :string]
   [:channel_type [:or :keyword :string]]
   [:details      [:maybe ::channel-template.details]]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]])

(mr/def ::channel-template.update
  "What an update (or insert) of a ChannelTemplate accepts: every column of `:channel_template` except `id`, all optional."
  [:map {:closed true}
   [:name         {:optional true} [:maybe :string]]
   [:channel_type {:optional true} [:maybe [:or :keyword :string]]]
   [:details      {:optional true} [:maybe ::channel-template.details]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]])
