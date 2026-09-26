(ns metabase-enterprise.content-diagnostics.test-util
  "Shared fixtures for the content-diagnostics suites."
  (:require
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn insert-finding!
  "Insert one finding, returning its id. A nil `invalidated-at` leaves the row active."
  [scan-id entity-id invalidated-at]
  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                   {:scan_id        scan-id
                                    :entity_type    :card
                                    :entity_id      entity-id
                                    :finding_type   :stale
                                    :invalidated_at invalidated-at})))

(defn with-authorized-reader!
  "`clojure.test` fixture giving `:rasta` the data-analyst role, so suites driving the finding-list
  endpoints as `:rasta` clear the audience gate. Analyst rather than either other arm: superuser bypasses
  the collection filtering these suites assert on, and `:monitoring` needs `:advanced-permissions`, which
  each test's own `with-premium-features` drops.

  The flag is not inert:
  - `collection/visible-collection-query` grants read on every `transforms`-namespace collection, so a
    test denying an unprivileged user sight of a transform needs its own `:monitoring` actor.
  - It writes the shared `:rasta` row, so the installing namespace must be `^:synchronized`."
  [thunk]
  (mt/with-data-analyst-role! (mt/user->id :rasta)
    (thunk)))
