(ns metabase.email.messages
  "Convenience functions for sending templated email messages.  Each function here should represent a single email.
   NOTE: we want to keep this about email formatting, so don't put heavy logic here RE: building data for emails."
  (:require [clojure.core.cache :as cache]
            [clojure.tools.logging :as log]
            [hiccup.core :refer [html]]
            [medley.core :as m]
            [metabase
             [config :as config]
             [email :as email]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.pulse.render :as render]
            [metabase.util
             [export :as export]
             [quotation :as quotation]
             [urls :as url]]
            [stencil
             [core :as stencil]
             [loader :as stencil-loader]]
            [toucan.db :as db])
  (:import [java.io File FileOutputStream]
           java.util.Arrays))

;; Dev only -- disable template caching
(when config/is-dev?
  (stencil-loader/set-cache (cache/ttl-cache-factory {} :ttl 0)))


;;; Various Context Helper Fns. Used to build Stencil template context

(defn- random-quote-context []
  (let [data-quote (quotation/random-quote)]
    {:quotation       (:quote data-quote)
     :quotationAuthor (:author data-quote)}))

(def ^:private ^:const notification-context
  {:emailType  "notification"
   :logoHeader true})

(def ^:private ^:const abandonment-context
  {:heading      "We’d love your feedback."
   :callToAction "It looks like Metabase wasn’t quite a match for you. Would you mind taking a fast 5 question survey to help the Metabase team understand why and make things better in the future?"
   :link         "http://www.metabase.com/feedback/inactive"})

(def ^:private ^:const follow-up-context
  {:heading      "We hope you've been enjoying Metabase."
   :callToAction "Would you mind taking a fast 6 question survey to tell us how it’s going?"
   :link         "http://www.metabase.com/feedback/active"})


;;; ### Public Interface

(defn send-new-user-email!
  "Send an email to INVITIED letting them know INVITOR has invited them to join Metabase."
  [invited invitor join-url]
  (let [company      (or (public-settings/site-name) "Unknown")
        message-body (stencil/render-file "metabase/email/new_user_invite"
                       (merge {:emailType    "new_user_invite"
                               :invitedName  (:first_name invited)
                               :invitorName  (:first_name invitor)
                               :invitorEmail (:email invitor)
                               :company      company
                               :joinUrl      join-url
                               :today        (u/format-date "MMM'&nbsp;'dd,'&nbsp;'yyyy")
                               :logoHeader   true}
                              (random-quote-context)))]
    (email/send-message!
      :subject      (str "You're invited to join " company "'s Metabase")
      :recipients   [(:email invited)]
      :message-type :html
      :message      message-body)))

(defn- all-admin-recipients
  "Return a sequence of email addresses for all Admin users.
   The first recipient will be the site admin (or oldest admin if unset), which is the address that should be used in `mailto` links
   (e.g., for the new user to email with any questions)."
  []
  (concat (when-let [admin-email (public-settings/admin-email)]
            [admin-email])
          (db/select-field :email 'User, :is_superuser true, :is_active true, {:order-by [[:id :asc]]})))

(defn send-user-joined-admin-notification-email!
  "Send an email to the INVITOR (the Admin who invited NEW-USER) letting them know NEW-USER has joined."
  [new-user & {:keys [google-auth?]}]
  {:pre [(map? new-user)]}
  (let [recipients (all-admin-recipients)]
    (email/send-message!
      :subject      (format (if google-auth?
                              "%s created a Metabase account"
                              "%s accepted their Metabase invite")
                            (:common_name new-user))
      :recipients   recipients
      :message-type :html
      :message      (stencil/render-file "metabase/email/user_joined_notification"
                      (merge {:logoHeader        true
                              :joinedUserName    (:first_name new-user)
                              :joinedViaSSO      google-auth?
                              :joinedUserEmail   (:email new-user)
                              :joinedDate        (u/format-date "EEEE, MMMM d") ; e.g. "Wednesday, July 13". TODO - is this what we want?
                              :adminEmail        (first recipients)
                              :joinedUserEditUrl (str (public-settings/site-url) "/admin/people")}
                             (random-quote-context))))))


(defn send-password-reset-email!
  "Format and send an email informing the user how to reset their password."
  [email google-auth? hostname password-reset-url]
  {:pre [(m/boolean? google-auth?)
         (u/email? email)
         (string? hostname)
         (string? password-reset-url)]}
  (let [message-body (stencil/render-file "metabase/email/password_reset"
                       {:emailType        "password_reset"
                        :hostname         hostname
                        :sso              google-auth?
                        :passwordResetUrl password-reset-url
                        :logoHeader       true})]
    (email/send-message!
      :subject      "[Metabase] Password Reset Request"
      :recipients   [email]
      :message-type :html
      :message      message-body)))

;; TODO - I didn't write these function and I don't know what it's for / what it's supposed to be doing. If this is determined add appropriate documentation

(defn- model-name->url-fn [model]
  (case model
    "Card"      url/card-url
    "Dashboard" url/dashboard-url
    "Pulse"     url/pulse-url
    "Segment"   url/segment-url))

(defn- add-url-to-dependency [{:keys [id model], :as obj}]
  (assoc obj :url ((model-name->url-fn model) id)))

(defn- build-dependencies
  "Build a sequence of dependencies from a MODEL-NAME->DEPENDENCIES map, and add various information such as obj URLs."
  [model-name->dependencies]
  (for [model-name (sort (keys model-name->dependencies))
        :let       [user-facing-name (if (= model-name "Card")
                                       "Saved Question"
                                       model-name)]
        deps       (get model-name->dependencies model-name)]
    {:model   user-facing-name
     :objects (for [dep deps]
                (add-url-to-dependency dep))}))

(defn send-notification-email!
  "Format and send an email informing the user about changes to objects in the system."
  [email context]
  {:pre [(u/email? email) (map? context)]}
  (let [context      (merge (update context :dependencies build-dependencies)
                            notification-context
                            (random-quote-context))
        message-body (stencil/render-file "metabase/email/notification" context)]
    (email/send-message!
      :subject      "[Metabase] Notification"
      :recipients   [email]
      :message-type :html
      :message      message-body)))

(defn send-follow-up-email!
  "Format and send an email to the system admin following up on the installation."
  [email msg-type]
  {:pre [(u/email? email) (contains? #{"abandon" "follow-up"} msg-type)]}
  (let [subject      (if (= "abandon" msg-type)
                       "[Metabase] Help make Metabase better."
                       "[Metabase] Tell us how things are going.")
        context      (merge notification-context
                            (random-quote-context)
                            (if (= "abandon" msg-type)
                              abandonment-context
                              follow-up-context))
        message-body (stencil/render-file "metabase/email/follow_up_email" context)]
    (email/send-message!
      :subject      subject
      :recipients   [email]
      :message-type :html
      :message      message-body)))

(defn- make-message-attachment [[content-id url]]
  {:type         :inline
   :content-id   content-id
   :content-type "image/png"
   :content      url})

(defn- pulse-context [pulse]
  (merge {:emailType    "pulse"
          :pulseName    (:name pulse)
          :sectionStyle (render/style (render/section-style))
          :colorGrey4   render/color-gray-4
          :logoFooter   true}
         (random-quote-context)))

(defn- create-temp-file
  [suffix]
  (doto (java.io.File/createTempFile "metabase_attachment" suffix)
    .deleteOnExit))

(defn- create-result-attachment-map [export-type card-name ^File attachment-file]
  (let [{:keys [content-type ext]} (get export/export-formats export-type)]
    {:type         :attachment
     :content-type content-type
     :file-name    (format "%s.%s" card-name ext)
     :content      (-> attachment-file .toURI .toURL)
     :description  (format "More results for '%s'" card-name)}))

(defn- result-attachments [results]
  (remove nil?
          (apply concat
                 (for [{{card-name :name, :as card} :card :as result} results
                       :let [{:keys [rows] :as result-data} (get-in result [:result :data])]
                       :when (seq rows)]
                   [(when-let [temp-file (and (render/include-csv-attachment? card result-data)
                                              (create-temp-file "csv"))]
                      (export/export-to-csv-writer temp-file result)
                      (create-result-attachment-map "csv" card-name temp-file))

                    (when-let [temp-file (and (render/include-xls-attachment? card result-data)
                                              (create-temp-file "xlsx"))]
                      (export/export-to-xlsx-file temp-file result)
                      (create-result-attachment-map "xlsx" card-name temp-file))]))))

(defn- render-message-body [message-template message-context timezone results]
  (let [rendered-cards (binding [render/*include-title* true]
                         ;; doall to ensure we haven't exited the binding before the valures are created
                         (doall (map #(render/render-pulse-section timezone %) results)))
        message-body   (assoc message-context :pulse (html (vec (cons :div (map :content rendered-cards)))))
        attachments    (apply merge (map :attachments rendered-cards))]
    (vec (concat [{:type "text/html; charset=utf-8" :content (stencil/render-file message-template message-body)}]
                 (map make-message-attachment attachments)
                 (result-attachments results)))))

(defn- assoc-attachment-booleans [pulse results]
  (for [{{result-card-id :id} :card :as result} results
        :let [pulse-card (m/find-first #(= (:id %) result-card-id) (:cards pulse))]]
    (update result :card merge (select-keys pulse-card [:include_csv :include_xls]))))

(defn render-pulse-email
  "Take a pulse object and list of results, returns an array of attachment objects for an email"
  [timezone pulse results]
  (render-message-body "metabase/email/pulse" (pulse-context pulse) timezone (assoc-attachment-booleans pulse results)))

(defn pulse->alert-condition-kwd
  "Given an `ALERT` return a keyword representing what kind of goal needs to be met."
  [{:keys [alert_above_goal alert_condition card creator] :as alert}]
  (if (= "goal" alert_condition)
    (if (true? alert_above_goal)
      :meets
      :below)
    :rows))

(defn- first-card
  "Alerts only have a single card, so the alerts API accepts a `:card` key, while pulses have `:cards`. Depending on
  whether the data comes from the alert API or pulse tasks, the card could be under `:card` or `:cards`"
  [alert]
  (or (:card alert)
      (first (:cards alert))))

(defn- default-alert-context
  ([alert]
   (default-alert-context alert nil))
  ([alert alert-condition-map]
   (let [{card-id :id, card-name :name} (first-card alert)]
     (merge {:questionURL (url/card-url card-id)
             :questionName card-name
             :emailType    "alert"
             :sectionStyle (render/section-style)
             :colorGrey4   render/color-gray-4
             :logoFooter   true}
            (random-quote-context)
            (when alert-condition-map
              {:alertCondition (get alert-condition-map (pulse->alert-condition-kwd alert))})))))

(defn- alert-results-condition-text [goal-value]
  {:meets (format "reached its goal of %s" goal-value)
   :below (format "gone below its goal of %s" goal-value)
   :rows  "results for you to see"})

(defn render-alert-email
  "Take a pulse object and list of results, returns an array of attachment objects for an email"
  [timezone {:keys [alert_first_only] :as alert} results goal-value]
  (let [message-ctx  (default-alert-context alert (alert-results-condition-text goal-value))]
    (render-message-body "metabase/email/alert"
                         (assoc message-ctx :firstRunOnly? alert_first_only)
                         timezone
                         (assoc-attachment-booleans alert results))))

(def ^:private alert-condition-text
  {:meets "when this question meets its goal"
   :below "when this question goes below its goal"
   :rows  "whenever this question has any results"})

(defn- send-email!
  "Sends an email on a background thread, returning a future."
  [user subject template-path template-context]
  (future
    (try
      (email/send-message-or-throw!
        {:recipients   [(:email user)]
         :message-type :html
         :subject      subject
         :message      (stencil/render-file template-path template-context)})
      (catch Exception e
        (log/errorf e "Failed to send message to '%s' with subject '%s'" (:email user) subject)))))

(defn- template-path [template-name]
  (str "metabase/email/" template-name ".mustache"))

;; Paths to the templates for all of the alerts emails
(def ^:private new-alert-template (template-path "alert_new_confirmation"))
(def ^:private you-unsubscribed-template (template-path "alert_unsubscribed"))
(def ^:private admin-unsubscribed-template (template-path "alert_admin_unsubscribed_you"))
(def ^:private added-template (template-path "alert_you_were_added"))
(def ^:private stopped-template (template-path "alert_stopped_working"))
(def ^:private deleted-template (template-path "alert_was_deleted"))

(defn send-new-alert-email!
  "Send out the initial 'new alert' email to the `CREATOR` of the alert"
  [{:keys [creator] :as alert}]
  (send-email! creator "You set up an alert" new-alert-template
               (default-alert-context alert alert-condition-text)))

(defn send-you-unsubscribed-alert-email!
  "Send an email to `WHO-UNSUBSCRIBED` letting them know they've unsubscribed themselves from `ALERT`"
  [alert who-unsubscribed]
  (send-email! who-unsubscribed "You unsubscribed from an alert" you-unsubscribed-template
               (default-alert-context alert)))

(defn send-admin-unsubscribed-alert-email!
  "Send an email to `USER-ADDED` letting them know `ADMIN` has unsubscribed them from `ALERT`"
  [alert user-added {:keys [first_name last_name] :as admin}]
  (let [admin-name (format "%s %s" first_name last_name)]
    (send-email! user-added "You’ve been unsubscribed from an alert" admin-unsubscribed-template
                 (assoc (default-alert-context alert) :adminName admin-name))))

(defn send-you-were-added-alert-email!
  "Send an email to `USER-ADDED` letting them know `ADMIN-ADDER` has added them to `ALERT`"
  [alert user-added {:keys [first_name last_name] :as admin-adder}]
  (let [subject (format "%s %s added you to an alert" first_name last_name)]
    (send-email! user-added subject added-template (default-alert-context alert alert-condition-text))))

(def ^:private not-working-subject "One of your alerts has stopped working")

(defn send-alert-stopped-because-archived-email!
  "Email to notify users when a card associated to their alert has been archived"
  [alert user {:keys [first_name last_name] :as archiver}]
  (let [deletion-text (format "the question was archived by %s %s" first_name last_name)]
    (send-email! user not-working-subject stopped-template (assoc (default-alert-context alert) :deletionCause deletion-text))))

(defn send-alert-stopped-because-changed-email!
  "Email to notify users when a card associated to their alert changed in a way that invalidates their alert"
  [alert user {:keys [first_name last_name] :as archiver}]
  (let [edited-text (format "the question was edited by %s %s" first_name last_name)]
    (send-email! user not-working-subject stopped-template (assoc (default-alert-context alert) :deletionCause edited-text))))

(defn send-admin-deleted-your-alert!
  "Email to notify users when an admin has deleted their alert"
  [alert user {:keys [first_name last_name] :as deletor}]
  (let [subject (format "%s %s deleted an alert you created" first_name last_name)
        admin-name (format "%s %s" first_name last_name)]
    (send-email! user subject deleted-template (assoc (default-alert-context alert) :adminName admin-name))))
