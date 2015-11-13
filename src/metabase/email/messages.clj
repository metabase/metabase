(ns metabase.email.messages
  "Convenience functions for sending templated email messages.  Each function here should represent a single email.
   NOTE: we want to keep this about email formatting, so don't put heavy logic here RE: building data for emails."
  (:require [hiccup.core :refer [html]]
            [metabase.email :as email]
            [metabase.models.setting :as setting]
            [metabase.util :as u]
            [metabase.util.quotation :as q]
            [stencil.core :as stencil]))


;;; ### Public Interface

(defn send-new-user-email
  "Format and Send an welcome email for newly created users."
  [invited invitor join-url]
  (let [tmpl (slurp (clojure.java.io/resource "metabase/email/new_user_invite.html"))
        data-quote (rand-nth q/quotations)
        company (or (setting/get :site-name)
                    "Unknown")
        message-body (->> {:invitedName (:first_name invited)
                           :invitorName (:first_name invitor)
                           :invitorEmail (:email invitor)
                           :company company
                           :joinUrl join-url
                           :quotation (:quote data-quote)
                           :quotationAuthor (:author data-quote)
                           :today (u/format-date "MMM'&nbsp;'dd,'&nbsp;'yyyy" (System/currentTimeMillis))}
                          (stencil/render-string tmpl))]
    (email/send-message
      :subject     (str "You're invited to join " company "'s Metabase")
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
  (let [message-body (html [:html
                            [:body
                             [:p (str (format "You're receiving this e-mail because you or someone else has requested a password for your user account at %s. " hostname)
                                      "It can be safely ignored if you did not request a password reset. Click the link below to reset your password.")]
                             [:p [:a {:href password-reset-url} password-reset-url]]]])]
    (email/send-message
     :subject      "[Metabase] Password Reset Request"
     :recipients   [email]
     :message-type :html
     :message      message-body)))
