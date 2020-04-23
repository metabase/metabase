(ns metabase.email.messages
  "Convenience functions for sending templated email messages.  Each function here should represent a single email.
   NOTE: we want to keep this about email formatting, so don't put heavy logic here RE: building data for emails."
  (:require [clojure.core.cache :as cache]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [hiccup.core :refer [html]]
            [java-time :as t]
            [medley.core :as m]
            [metabase
             [config :as config]
             [email :as email]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.pulse.render :as render]
            [metabase.pulse.render
             [body :as render.body]
             [style :as render.style]]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.query-processor.streaming.interface :as qp.streaming.i]
            [metabase.util
             [i18n :refer [deferred-trs trs tru]]
             [quotation :as quotation]
             [urls :as url]]
            [stencil
             [core :as stencil]
             [loader :as stencil-loader]]
            [toucan.db :as db])
  (:import [java.io File IOException]))

(when config/is-dev?
  (alter-meta! #'stencil.core/render-file assoc :style/indent 1))

;; Dev only -- disable template caching
(when config/is-dev?
  (stencil-loader/set-cache (cache/ttl-cache-factory {} :ttl 0)))


;;; Various Context Helper Fns. Used to build Stencil template context

(defn- random-quote-context []
  (let [data-quote (quotation/random-quote)]
    {:quotation       (:quote data-quote)
     :quotationAuthor (:author data-quote)}))

(def ^:private notification-context
  {:emailType  "notification"
   :logoHeader true})

(defn- abandonment-context []
  {:heading      (trs "We’d love your feedback.")
   :callToAction (str (deferred-trs "It looks like Metabase wasn’t quite a match for you.")
                      " "
                      (deferred-trs "Would you mind taking a fast 5 question survey to help the Metabase team understand why and make things better in the future?"))
   :link         "https://metabase.com/feedback/inactive"})

(defn- follow-up-context []
  {:heading      (trs "We hope you''ve been enjoying Metabase.")
   :callToAction (trs "Would you mind taking a fast 6 question survey to tell us how it’s going?")
   :link         "https://metabase.com/feedback/active"})


;;; ### Public Interface

(defn send-new-user-email!
  "Send an email to `invitied` letting them know `invitor` has invited them to join Metabase."
  [invited invitor join-url]
  (let [company      (or (public-settings/site-name) "Unknown")
        message-body (stencil/render-file "metabase/email/new_user_invite"
                       (merge {:emailType    "new_user_invite"
                               :invitedName  (:first_name invited)
                               :invitorName  (:first_name invitor)
                               :invitorEmail (:email invitor)
                               :company      company
                               :joinUrl      join-url
                               :today        (t/format "MMM'&nbsp;'dd,'&nbsp;'yyyy" (t/zoned-date-time))
                               :logoHeader   true}
                              (random-quote-context)))]
    (email/send-message!
      :subject      (str "You're invited to join " company "'s Metabase")
      :recipients   [(:email invited)]
      :message-type :html
      :message      message-body)))

(defn- all-admin-recipients
  "Return a sequence of email addresses for all Admin users.

  The first recipient will be the site admin (or oldest admin if unset), which is the address that should be used in
  `mailto` links (e.g., for the new user to email with any questions)."
  []
  (concat (when-let [admin-email (public-settings/admin-email)]
            [admin-email])
          (db/select-field :email 'User, :is_superuser true, :is_active true, {:order-by [[:id :asc]]})))

(defn send-user-joined-admin-notification-email!
  "Send an email to the `invitor` (the Admin who invited `new-user`) letting them know `new-user` has joined."
  [new-user & {:keys [google-auth?]}]
  {:pre [(map? new-user)]}
  (let [recipients (all-admin-recipients)]
    (email/send-message!
      :subject      (str (if google-auth?
                           (trs "{0} created a Metabase account"     (:common_name new-user))
                           (trs "{0} accepted their Metabase invite" (:common_name new-user))))
      :recipients   recipients
      :message-type :html
      :message      (stencil/render-file "metabase/email/user_joined_notification"
                      (merge {:logoHeader        true
                              :joinedUserName    (:first_name new-user)
                              :joinedViaSSO      google-auth?
                              :joinedUserEmail   (:email new-user)
                              :joinedDate        (t/format "EEEE, MMMM d" (t/zoned-date-time)) ; e.g. "Wednesday, July 13". TODO - is this what we want?
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
      :subject      (trs "[Metabase] Password Reset Request")
      :recipients   [email]
      :message-type :html
      :message      message-body)))

;; TODO - I didn't write these function and I don't know what it's for / what it's supposed to be doing. If this is
;; determined add appropriate documentation

(defn- model-name->url-fn [model]
  (case model
    "Card"      url/card-url
    "Dashboard" url/dashboard-url
    "Pulse"     url/pulse-url
    "Segment"   url/segment-url))

(defn- add-url-to-dependency [{:keys [id model], :as obj}]
  (assoc obj :url ((model-name->url-fn model) id)))

(defn- build-dependencies
  "Build a sequence of dependencies from a `model-name->dependencies` map, and add various information such as obj URLs."
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
      :subject      (trs "[Metabase] Notification")
      :recipients   [email]
      :message-type :html
      :message      message-body)))

(defn send-follow-up-email!
  "Format and send an email to the system admin following up on the installation."
  [email msg-type]
  {:pre [(u/email? email) (contains? #{"abandon" "follow-up"} msg-type)]}
  (let [subject      (str (if (= "abandon" msg-type)
                            (trs "[Metabase] Help make Metabase better.")
                            (trs "[Metabase] Tell us how things are going.")))
        context      (merge notification-context
                            (random-quote-context)
                            (if (= "abandon" msg-type)
                              (abandonment-context)
                              (follow-up-context)))
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
          :sectionStyle (render.style/style (render.style/section-style))
          :colorGrey4   render.style/color-gray-4
          :logoFooter   true}
         (random-quote-context)))

(defn- create-temp-file
  "Separate from `create-temp-file-or-throw` primarily so that we can simulate exceptions in tests"
  [suffix]
  (doto (File/createTempFile "metabase_attachment" suffix)
    .deleteOnExit))

(defn- create-temp-file-or-throw
  "Tries to create a temp file, will give the users a better error message if we are unable to create the temp file"
  [suffix]
  (try
    (create-temp-file suffix)
    (catch IOException e
      (let [ex-msg (tru "Unable to create temp file in `{0}` for email attachments "
                        (System/getProperty "java.io.tmpdir"))]
        (throw (IOException. ex-msg e))))))

(defn- create-result-attachment-map [export-type card-name ^File attachment-file]
  (let [{:keys [content-type]} (qp.streaming.i/stream-options export-type)]
    {:type         :attachment
     :content-type content-type
     :file-name    (format "%s.%s" card-name (name export-type))
     :content      (-> attachment-file .toURI .toURL)
     :description  (format "More results for '%s'" card-name)}))

(defn- include-csv-attachment?
  "Should this `card` and `results` include a CSV attachment?"
  [{include-csv? :include_csv, include-xls? :include_xls, card-name :name, :as card} {:keys [cols rows], :as result-data}]
  (letfn [(yes [reason & args]
            (log/tracef "Including CSV attachement for Card %s because %s" (pr-str card-name) (apply format reason args))
            true)
          (no [reason & args]
            (log/tracef "NOT including CSV attachement for Card %s because %s" (pr-str card-name) (apply format reason args))
            false)]
    (cond
      include-csv?
      (yes "it has `:include_csv`")

      include-xls?
      (no "it has `:include_xls`")

      (some (complement render.body/show-in-table?) cols)
      (yes "some columns are not included in rendered results")

      (not= :table (render/detect-pulse-chart-type card result-data))
      (no "we've determined it should not be rendered as a table")

      (= (count (take render.body/cols-limit cols)) render.body/cols-limit)
      (yes "the results have >= %d columns" render.body/cols-limit)

      (= (count (take render.body/rows-limit rows)) render.body/rows-limit)
      (yes "the results have >= %d rows" render.body/rows-limit)

      :else
      (no "less than %d columns, %d rows in results" render.body/cols-limit render.body/rows-limit))))

(defn- result-attachment
  [{{card-name :name, :as card} :card, {{:keys [rows], :as result-data} :data, :as result} :result}]
  (when (seq rows)
    [(when-let [temp-file (and (include-csv-attachment? card result-data)
                               (create-temp-file-or-throw "csv"))]
       (with-open [os (io/output-stream temp-file)]
         (qp.streaming/stream-api-results-to-export-format :csv os result))
       (create-result-attachment-map "csv" card-name temp-file))
     (when-let [temp-file (and (:include_xls card)
                               (create-temp-file-or-throw "xlsx"))]
       (with-open [os (io/output-stream temp-file)]
         (qp.streaming/stream-api-results-to-export-format :xlsx os result))
       (create-result-attachment-map "xlsx" card-name temp-file))]))

(defn- result-attachments [results]
  (filter some? (mapcat result-attachment results)))

(defn- render-message-body [message-template message-context timezone results]
  (let [rendered-cards (binding [render/*include-title* true]
                         ;; doall to ensure we haven't exited the binding before the valures are created
                         (mapv #(render/render-pulse-section timezone %) results))
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
  "Given an `alert` return a keyword representing what kind of goal needs to be met."
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
             :sectionStyle (render.style/section-style)
             :colorGrey4   render.style/color-gray-4
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
(def ^:private new-alert-template          (template-path "alert_new_confirmation"))
(def ^:private you-unsubscribed-template   (template-path "alert_unsubscribed"))
(def ^:private admin-unsubscribed-template (template-path "alert_admin_unsubscribed_you"))
(def ^:private added-template              (template-path "alert_you_were_added"))
(def ^:private stopped-template            (template-path "alert_stopped_working"))
(def ^:private deleted-template            (template-path "alert_was_deleted"))

(defn send-new-alert-email!
  "Send out the initial 'new alert' email to the `creator` of the alert"
  [{:keys [creator] :as alert}]
  (send-email! creator "You set up an alert" new-alert-template
               (default-alert-context alert alert-condition-text)))

(defn send-you-unsubscribed-alert-email!
  "Send an email to `who-unsubscribed` letting them know they've unsubscribed themselves from `alert`"
  [alert who-unsubscribed]
  (send-email! who-unsubscribed "You unsubscribed from an alert" you-unsubscribed-template
               (default-alert-context alert)))

(defn send-admin-unsubscribed-alert-email!
  "Send an email to `user-added` letting them know `admin` has unsubscribed them from `alert`"
  [alert user-added {:keys [first_name last_name] :as admin}]
  (let [admin-name (format "%s %s" first_name last_name)]
    (send-email! user-added "You’ve been unsubscribed from an alert" admin-unsubscribed-template
                 (assoc (default-alert-context alert) :adminName admin-name))))

(defn send-you-were-added-alert-email!
  "Send an email to `user-added` letting them know `admin-adder` has added them to `alert`"
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
