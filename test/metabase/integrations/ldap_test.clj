(ns metabase.integrations.ldap-test
  (:require [expectations :refer :all]
            [metabase.integrations.ldap :as ldap]
            [metabase.test.util :refer [resolve-private-vars]]))

(resolve-private-vars metabase.integrations.ldap escape-value)

(expect
  "\\2AJohn \\28Dude\\29 Doe\\5C"
  (escape-value "*John (Dude) Doe\\"))
