(ns metabase-enterprise.util-test
  (:require [metabase.public-settings.premium-features :refer [defenterprise]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Defenterprise Macro                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These `defenterprise` calls define the EE versions of test functions which are used in
;; `metabase.public-settings.premium-features-test`, for testing the `defenterprise` macro itself

(defenterprise greeting
  "Returns an special greeting for an enterprise user."
  [username]
  (str "Hi " (name username) ", you're running the Enterprise Edition of Metabase!"))

(defenterprise greeting-with-valid-token
  "Returns an extra special greeting for a user if the instance has a valid premium features token. Else, returns the
  default (OSS) greeting."
  :feature :any
  [username]
  (str "Hi " (name username) ", you're an EE customer with a valid token!"))

(defenterprise special-greeting
  "Returns an extra special greeting for a user if the instance has a :special-greeting feature token. Else,
  returns the default (OSS) greeting."
  :feature :special-greeting
  [username]
  (str "Hi " (name username) ", you're an extra special EE customer!"))

(defenterprise special-greeting-or-error
  "Returns an extra special greeting for a user if the instance has a :special-greeting feature token. Else,
  throws an exception."
  :feature  :special-greeting
  :fallback :error
  [username]
  (str "Hi " (name username) ", you're an extra special EE customer!"))

(defn- special-greeting-fallback
  [username]
  (str "Hi " (name username) ", you're an EE customer but not extra special."))

(defenterprise special-greeting-or-custom
  "Returns an extra special greeting for a user if the instance has a :special-greeting feature token. Else,
  returns a custom greeting for enterprise users without the token."
  :feature  :special-greeting
  :fallback special-greeting-fallback
  [username]
  (str "Hi " (name username) ", you're an extra special EE customer!"))
