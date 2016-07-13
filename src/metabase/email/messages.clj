(ns metabase.email.messages
  "Convenience functions for sending templated email messages.  Each function here should represent a single email.
   NOTE: we want to keep this about email formatting, so don't put heavy logic here RE: building data for emails."
  (:require [clojure.core.cache :as cache]
            [hiccup.core :refer [html]]
            [medley.core :as m]
            (stencil [core :as stencil]
                     [loader :as stencil-loader])
            (metabase [config :as config]
                      [db :as db]
                      [email :as email])
            [metabase.models.setting :as setting]
            [metabase.pulse.render :as render]
            [metabase.util :as u]
            (metabase.util [quotation :as quotation]
                           [urls :as url])))

;; Dev only -- disable template caching
(when config/is-dev?
  (stencil-loader/set-cache (cache/ttl-cache-factory {} :ttl 0)))


;;; ### Public Interface

(defn send-new-user-email
  "Format and send an welcome email for newly created users."
  [invited invitor join-url]
  (let [data-quote   (quotation/random-quote)
        company      (or (setting/get :site-name) "Unknown")
        message-body (stencil/render-file "metabase/email/new_user_invite"
                       {:emailType       "new_user_invite"
                        :invitedName     (:first_name invited)
                        :invitorName     (:first_name invitor)
                        :invitorEmail    (:email invitor)
                        :company         company
                        :joinUrl         join-url
                        :quotation       (:quote data-quote)
                        :quotationAuthor (:author data-quote)
                        :today           (u/format-date "MMM'&nbsp;'dd,'&nbsp;'yyyy")
                        :logoHeader      true})]
    (email/send-message
      :subject      (str "You're invited to join " company "'s Metabase")
      :recipients   [(:email invited)]
      :message-type :html
      :message      message-body)))


(defn send-user-joined-admin-notification-email
  "Send an email to the admin of this Metabase instance letting them know a new user joined."
  [new-user invitor google-auth?]
  {:pre [(map? new-user)
         (m/boolean? google-auth?)
         (or google-auth?
             (and (map? invitor)
                  (u/is-email? (:email invitor))))]}
  (let [data-quote (quotation/random-quote)]
    (email/send-message
      :subject      (format (if google-auth?
                              "%s created a Metabase account"
                              "%s accepted your Metabase invite")
                            (:common_name new-user))
      :recipients   (if google-auth?
                      (vec (conj (db/select-field :email 'User, :is_superuser true) ; send email to all admins
                                 (setting/get :admin-email)))
                      [(:email invitor)])
      :message-type :html
      :message      (stencil/render-file "metabase/email/user_joined_notification"
                      {:logoHeader        true
                       :quotation         (:quote data-quote)
                       :quotationAuthor   (:author data-quote)
                       :joinedUserName    (:first_name new-user)
                       :joinedViaSSO      google-auth?
                       :joinedUserEmail   (:email new-user)
                       :joinedDate        (u/format-date "EEEE, MMMM d") ; e.g. "Wednesday, July 13". TODO - is this what we want?
                       :invitorEmail      (:email invitor)
                       :joinedUserEditUrl (str (setting/get :-site-url) "/admin/people")})))) ;


(defn send-password-reset-email
  "Format and send an email informing the user how to reset their password."
  [email google-auth? hostname password-reset-url]
  {:pre [(string? email)
         (m/boolean? google-auth?)
         (u/is-email? email)
         (string? hostname)
         (string? password-reset-url)]}
  (let [message-body (stencil/render-file "metabase/email/password_reset"
                       {:emailType        "password_reset"
                        :hostname         hostname
                        :sso              google-auth?
                        :passwordResetUrl password-reset-url
                        :logoHeader       true})]
    (email/send-message
      :subject      "[Metabase] Password Reset Request"
      :recipients   [email]
      :message-type :html
      :message      message-body)))


(defn send-notification-email
  "Format and send an email informing the user about changes to objects in the system."
  [email context]
  {:pre [(string? email)
         (u/is-email? email)
         (map? context)]}
  (let [model->url-fn #(case %
                        "Card"      url/card-url
                        "Dashboard" url/dashboard-url
                        "Pulse"     url/pulse-url
                        "Segment"   url/segment-url)
        add-url       (fn [{:keys [id model] :as obj}]
                        (assoc obj :url (apply (model->url-fn model) [id])))
        data-quote    (quotation/random-quote)
        context       (-> context
                          (update :dependencies (fn [deps-by-model]
                                                  (for [model (sort (set (keys deps-by-model)))
                                                        deps  (mapv add-url (get deps-by-model model))]
                                                    {:model   (case model
                                                                "Card" "Saved Question"
                                                                model)
                                                     :objects deps})))
                          (assoc :emailType "notification"
                                 :logoHeader true
                                 :quotation (:quote data-quote)
                                 :quotationAuthor (:author data-quote)))
        message-body  (stencil/render-file "metabase/email/notification" context)]
    (email/send-message
      :subject      "[Metabase] Notification"
      :recipients   [email]
      :message-type :html
      :message      message-body)))


(defn send-follow-up-email
  "Format and send an email to the system admin following up on the installation."
  [email msg-type]
  {:pre [(string? email)
         (u/is-email? email)
         (contains? #{"abandon" "follow-up"} msg-type)]}
  (let [subject       (if (= "abandon" msg-type)
                        "[Metabase] Help make Metabase better."
                        "[Metabase] Tell us how things are going.")
        data-quote    (quotation/random-quote)
        context       (merge {:emailType       "notification"
                              :logoHeader      true
                              :quotation       (:quote data-quote)
                              :quotationAuthor (:author data-quote)}
                             (if (= "abandon" msg-type)
                               {:heading      "We’d love your feedback."
                                :callToAction "It looks like Metabase wasn’t quite a match for you. Would you mind taking a fast 5 question survey to help the Metabase team understand why and make things better in the future?"
                                :link         "http://www.metabase.com/feedback/inactive"}
                               {:heading      "We hope you've been enjoying Metabase."
                                :callToAction "Would you mind taking a fast 6 question survey to tell us how it’s going?"
                                :link         "http://www.metabase.com/feedback/active"}))
        message-body  (stencil/render-file "metabase/email/follow_up_email" context)]
    (email/send-message
      :subject      subject
      :recipients   [email]
      :message-type :html
      :message      message-body)))


;; HACK: temporary workaround to postal requiring a file as the attachment
(defn- write-byte-array-to-temp-file
  [^bytes img-bytes]
  (let [file (doto (java.io.File/createTempFile "metabase_pulse_image_" ".png")
               .deleteOnExit)]
    (with-open [fos (java.io.FileOutputStream. file)]
      (.write fos img-bytes))
    file))

(defn- render-image [images-atom, ^bytes image-bytes]
  (str "cid:IMAGE" (or (u/first-index-satisfying (fn [^bytes item]
                                                   (java.util.Arrays/equals item image-bytes))
                                                 @images-atom)
                       (u/prog1 (count @images-atom)
                         (swap! images-atom conj image-bytes)))))

(defn render-pulse-email
  "Take a pulse object and list of results, returns an array of attachment objects for an email"
  [pulse results]
  (let [images       (atom [])
        body         (binding [render/*include-title* true
                               render/*render-img-fn* (partial render-image images)]
                       (vec (cons :div (for [result results]
                                         (render/render-pulse-section result)))))
        data-quote   (quotation/random-quote)
        message-body (stencil/render-file "metabase/email/pulse"
                       {:emailType       "pulse"
                        :pulse           (html body)
                        :pulseName       (:name pulse)
                        :sectionStyle    render/section-style
                        :colorGrey4      render/color-gray-4
                        :quotation       (:quote data-quote)
                        :quotationAuthor (:author data-quote)
                        :logoFooter      true})]
    (apply vector {:type "text/html; charset=utf-8" :content message-body}
           (map-indexed (fn [idx bytes] {:type         :inline
                                         :content-id   (str "IMAGE" idx)
                                         :content-type "image/png"
                                         :content      (write-byte-array-to-temp-file bytes)})
                        @images))))
