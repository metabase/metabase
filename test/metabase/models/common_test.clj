(ns metabase.models.common-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.common :refer [name->human-readable-name]]
            [metabase.test.data :refer :all]))


;; testing on `(name->human-readable-name)`
(expect nil (name->human-readable-name nil))
(expect nil (name->human-readable-name ""))
(expect "" (name->human-readable-name "_"))
(expect "" (name->human-readable-name "-"))
(expect "Id" (name->human-readable-name "_id"))
(expect "Agent Invite Migration" (name->human-readable-name "_agent_invite_migration"))
(expect "Agent Invite Migration" (name->human-readable-name "-agent-invite-migration"))
(expect "Foobar" (name->human-readable-name "fooBar"))
(expect "Foo Bar" (name->human-readable-name "foo-bar"))
(expect "Foo Bar" (name->human-readable-name "foo_bar"))
(expect "Foo Id" (name->human-readable-name "foo_id"))
