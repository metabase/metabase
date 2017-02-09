(ns metabase.integrations.ldap-test
  (:require [expectations :refer :all]
            [metabase.integrations.ldap :as ldap]
            [metabase.test.util :refer [resolve-private-vars]]))


(expect
  "\\2AJohn \\28Dude\\29 Doe\\5C"
  (ldap/escape-value "*John (Dude) Doe\\"))
