(ns metabase.models.common-test
  (:require [expectations :refer :all]
            [metabase.models.common :refer [name->human-readable-name]]
            [metabase.test.data :refer :all]))


;; testing on `(name->human-readable-name)`
(expect nil (name->human-readable-name nil))
(expect nil (name->human-readable-name ""))
(expect "" (name->human-readable-name "_"))
(expect "" (name->human-readable-name "-"))
(expect "ID" (name->human-readable-name "_id"))
(expect "Agent Invite Migration" (name->human-readable-name "_agent_invite_migration"))
(expect "Agent Invite Migration" (name->human-readable-name "-agent-invite-migration"))
(expect "Foo Bar" (name->human-readable-name "fooBar"))
(expect "Foo Bar" (name->human-readable-name "foo-bar"))
(expect "Foo Bar" (name->human-readable-name "foo_bar"))
(expect "Foo Bar" (name->human-readable-name "foo bar"))
(expect "Dashboard Card Subscription" (name->human-readable-name "dashboardcardsubscription"))
(expect "Foo ID" (name->human-readable-name "foo_id"))
(expect "Receiver ID" (name->human-readable-name "receiver_id"))
