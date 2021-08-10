(ns metabase-enterprise.serialization.cmd-test
  (:require [clojure.test :as t]
            [metabase.cmd :as cmd]
            [metabase.db.schema-migrations-test.impl :as schema-migrations-test.impl]
            [metabase.models :refer [Card User]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import java.util.UUID))

(t/use-fixtures :once (fixtures/initialize :db))

(defmacro ^:private with-empty-h2-app-db
  "Runs `body` under a new, blank, H2 application database (randomly named), in which all model tables have been
  created via Liquibase schema migrations. After `body` is finished, the original app DB bindings are restored.

  Makes use of functionality in the `metabase.db.schema-migrations-test.impl` namespace since that already does
  what we need."
  [& body]
  `(schema-migrations-test.impl/with-temp-empty-app-db [conn# :h2]
     (schema-migrations-test.impl/run-migrations-in-range! conn# [0 999999]) ; this should catch all migrations)
     ~@body))

(t/deftest no-collections-test
  (t/testing "Dumping a card when there are no active collection should work properly (#16931)"
    ;; we need a blank H2 app db, temporarily, in order to run this test (to ensure we have no collections present,
    ;; while also not deleting or messing with any existing user personal collections that the real app DB might have,
    ;; since that will interfere with other tests)
    ;; making use of the functionality in the metabase.db.schema-migrations-test.impl namespace for this (since it
    ;; already does what we need)
    (with-empty-h2-app-db
      ;; create a single dummy user, to own a card
      (let [user (db/simple-insert! User
                   :email        "nobody@nowhere.com"
                   :first_name   (mt/random-name)
                   :last_name    (mt/random-name)
                   :password     (str (UUID/randomUUID))
                   :date_joined  :%now
                   :is_active    true
                   :is_superuser true)]
        ;; then the card itself
        (db/simple-insert! Card
          :name                   "Single Card"
          :display                "Single Card"
          :dataset_query          {}
          :creator_id             (u/the-id user)
          :visualization_settings "{}"
          :created_at :%now
          :updated_at :%now)
        ;; serialize "everything" (which should just be the card and user), which should succeed if #16931 is fixed
        (cmd/dump (str (System/getProperty "java.io.tmpdir") "/" (mt/random-name)))))))
