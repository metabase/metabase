(ns metabase.login-history.core
  (:require
   [metabase.login-history.record]
   [potemkin :as p]))

(comment metabase.login-history.record/keep-me)

(p/import-vars
 [metabase.login-history.record
  record-login-history!])
