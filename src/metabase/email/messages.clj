(ns metabase.email.messages
  "Convenience functions for sending templated email messages.  Each function here should represent a single email.
   NOTE: we want to keep this about email formatting, so don't put heavy logic here RE: building data for emails."
  (:require [hiccup.core :refer [html]]
            [metabase.email :as email]
            [metabase.util :as u]))


;;; ### Public Interface

(defn send-new-user-email
  "Format and Send an welcome email for newly created users."
  [first_name email password-reset-url]
  {:pre [(string? first_name)
         (string? email)
         (u/is-email? email)
         (string? password-reset-url)]}
  (let [message-body (html [:html
                            [:body
                             [:p (format "Welcome to Metabase %s!" first_name)]
                             [:p "Your account is setup and ready to go, you just need to set a password so you can login.  Follow the link below to reset your account password."]
                             [:p [:a {:href password-reset-url} password-reset-url]]]])]
    (email/send-message
      "Your new Metabase account is all set up"
      {email email}
      :html message-body)
    ;; return the message body we sent
    message-body))

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
      "[Metabase] Password Reset Request"
      {email email}
      :html message-body)
    ;; return the message body we sent
    message-body))
