(ns metabase.email.messages
  "Convenience functions for sending templated email messages.  Each function here should represent a single email.
   NOTE: we want to keep this about email formatting, so don't put heavy logic here RE: building data for emails."
  (:require [clojure.core.cache :as cache]
            [hiccup.core :refer [html]]
            [medley.core :as m]
            [metabase
             [config :as config]
             [email :as email]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.pulse.render :as render]
            [metabase.util
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
         (u/is-email? email)
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
  {:pre [(u/is-email? email) (map? context)]}
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
  {:pre [(u/is-email? email) (contains? #{"abandon" "follow-up"} msg-type)]}
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


;; HACK: temporary workaround to postal requiring a file as the attachment
(defn- write-byte-array-to-temp-file
  [^bytes img-bytes]
  (u/prog1 (doto (File/createTempFile "metabase_pulse_image_" ".png")
             .deleteOnExit)
    (with-open [fos (FileOutputStream. <>)]
      (.write fos img-bytes))))

(defn- hash-bytes
  "Generate a hash to be used in a Content-ID"
  [^bytes img-bytes]
  (Math/abs ^Integer (Arrays/hashCode img-bytes)))

(defn- render-image [images-atom, ^bytes image-bytes]
  (let [content-id (str (hash-bytes image-bytes) "@metabase")]
    (if-not (contains? @images-atom content-id)
      (swap! images-atom assoc content-id image-bytes))
    (str "cid:" content-id)))

(defn- write-image-content [[content-id bytes]]
  {:type         :inline
   :content-id   content-id
   :content-type "image/png"
   :content      (write-byte-array-to-temp-file bytes)})

(defn- pulse-context [body pulse]
  (merge {:emailType    "pulse"
          :pulse        (html body)
          :pulseName    (:name pulse)
          :sectionStyle render/section-style
          :colorGrey4   render/color-gray-4
          :logoFooter   true}
         (random-quote-context)))

(defn render-pulse-email
  "Take a pulse object and list of results, returns an array of attachment objects for an email"
  [pulse results]
  (let [images       (atom {})
        body         (binding [render/*include-title* true
                               render/*render-img-fn* (partial render-image images)]
                       (vec (cons :div (for [result results]
                                         (render/render-pulse-section result)))))
        message-body (stencil/render-file "metabase/email/pulse"
                       (pulse-context body pulse))]
    (vec (cons {:type "text/html; charset=utf-8" :content message-body}
               (mapv write-image-content (seq @images))))))
