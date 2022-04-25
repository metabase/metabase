(ns metabase-enterprise.util-test
  (:require [metabase.public-settings.premium-features :refer [defenterprise defenterprise-schema]]
            [schema.core :as s]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Defenterprise Macro                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These `defenterprise` calls define the EE versions of test functions which are used in
;; `metabase.public-settings.premium-features-test`, for testing the `defenterprise` macro itself

(defenterprise greeting
  "Returns an special greeting for anyone running the Enterprise Edition, regardless of token."
  :feature :none
  [username]
  (format "Hi %s, you're running the Enterprise Edition of Metabase!" (name username)))

(defenterprise greeting-with-valid-token
  "Returns an extra special greeting for a user if the instance has a valid premium features token. Else, returns the
  default (OSS) greeting."
  :feature :any
  [username]
  (format "Hi %s, you're an EE customer with a valid token!" (name username)))

(defenterprise special-greeting
  "Returns an extra special greeting for a user if the instance has a :special-greeting feature token. Else,
  returns the default (OSS) greeting."
  :feature :special-greeting
  [username]
  (format "Hi %s, you're an extra special EE customer!" (name username)))

(defn- special-greeting-fallback
  [username]
  (format "Hi %s, you're an EE customer but not extra special." (name username)))

(defenterprise special-greeting-or-custom
  "Returns an extra special greeting for a user if the instance has a :special-greeting feature token. Else,
  returns a custom greeting for enterprise users without the token."
  :feature  :special-greeting
  :fallback special-greeting-fallback
  [username]
  (format "Hi %s, you're an extra special EE customer!" (name username)))

(defenterprise-schema greeting-with-schema :- s/Str
  "Returns a greeting for a user, with schemas for the argument and return value."
  :feature :none
  [username :- s/Keyword]
  (format "Hi %s, the schema was valid, and you're running the Enterprise Edition of Metabase!" (name username)))

(defenterprise-schema greeting-with-invalid-oss-return-schema :- s/Str
  "Returns a greeting for a user."
  :feature :none
  [username :- s/Keyword]
  (format "Hi %s, the schema was valid, and you're running the Enterprise Edition of Metabase!" (name username)))

(defenterprise-schema greeting-with-invalid-ee-return-schema :- s/Keyword
  "Returns a greeting for a user."
  :feature :custom-feature
  [username :- s/Keyword]
  (format "Hi %s, the schema was valid, and you're running the Enterprise Edition of Metabase!" (name username)))
