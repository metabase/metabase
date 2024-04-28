(ns metabase-enterprise.test
  "Catch-all test util namespace. Similar to [[metabase.test]], but for EE stuff."
  (:require
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [potemkin :as p]))

(comment sandbox.tu/keep-me)

(p/import-vars
 [sandbox.tu
  with-gtaps!
  with-gtaps-for-user!
  with-user-attributes])
