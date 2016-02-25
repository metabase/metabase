(ns metabase.email.messages
  "Convenience functions for sending templated email messages.  Each function here should represent a single email.
   NOTE: we want to keep this about email formatting, so don't put heavy logic here RE: building data for emails."
  (:require [hiccup.core :refer [html]]
            [stencil.core :as stencil]
            [stencil.loader :as loader]
            [metabase.email :as email]
            [metabase.models.setting :as setting]
            [metabase.pulse :as p]
            [metabase.util :as u]
            (metabase.util [quotation :as quotation]
                           [urls :as url])))

;; NOTE: uncomment this in development to disable template caching
;; (loader/set-cache (clojure.core.cache/ttl-cache-factory {} :ttl 0))

;;; ### Public Interface

(defn send-new-user-email
  "Format and Send an welcome email for newly created users."
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
                                           :today           (u/format-date "MMM'&nbsp;'dd,'&nbsp;'yyyy" (System/currentTimeMillis))
                                           :logoHeader      true})]
    (email/send-message
     :subject      (str "You're invited to join " company "'s Metabase")
     :recipients   [(:email invited)]
     :message-type :html
     :message      message-body)))

(defn send-password-reset-email
  "Format and Send an email informing the user how to reset their password."
  [email hostname password-reset-url]
  {:pre [(string? email)
         (u/is-email? email)
         (string? hostname)
         (string? password-reset-url)]}
  (let [message-body (stencil/render-file "metabase/email/password_reset"
                                          {:emailType "password_reset"
                                           :hostname hostname
                                           :passwordResetUrl password-reset-url
                                           :logoHeader true})]
    (email/send-message
     :subject      "[Metabase] Password Reset Request"
     :recipients   [email]
     :message-type :html
     :message      message-body)))

(defn send-notification-email
  "Format and Send an email informing the user about changes to objects in the system."
  [email context]
  {:pre [(string? email)
         (u/is-email? email)
         (map? context)]}
  (let [model->url-fn #(case %
                        "Card"      url/question-url
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
        body         (binding [p/*include-title* true
                               p/*render-img-fn* (partial render-image images)]
                       (vec (cons :div (for [result results]
                                         (p/render-pulse-section result)))))
        data-quote   (quotation/random-quote)
        message-body (stencil/render-file "metabase/email/pulse"
                                          {:emailType       "pulse"
                                           :pulse           (html body)
                                           :pulseName       (:name pulse)
                                           :sectionStyle    p/section-style
                                           :colorGrey4      p/color-grey-4
                                           :quotation       (:quote data-quote)
                                           :quotationAuthor (:author data-quote)
                                           :logoFooter      true})]
    (apply vector {:type "text/html; charset=utf-8" :content message-body}
           (map-indexed (fn [idx bytes] {:type         :inline
                                         :content-id   (str "IMAGE" idx)
                                         :content-type "image/png"
                                         :content      (write-byte-array-to-temp-file bytes)})
                        @images))))
