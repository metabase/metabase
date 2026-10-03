(ns metabase.driver.quack.conn
  "Connection-resolution + SSH-tunnel + execution helpers for the Quack driver.

  Split out of `metabase.driver.quack` so that both `quack` (the driver entry)
  and `quack.actions` (writeback actions) can share the same tunnel-aware
  execution primitives without a require cycle (`quack` requires `quack.actions`
  to register the action multimethods; `quack.actions` needs the tunnel helper
  to actually run DML).

  No dependency on either `quack.clj` or `quack.actions.clj` — only on the
  Quack HTTP client and Metabase's driver-connection + SSH-tunnel machinery."
  (:require
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.quack.client :as quack.client]
   [metabase.driver.sql-jdbc.connection.ssh-tunnel :as ssh]
   [metabase.util.performance :refer [select-keys]]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Connection details helpers
;;; ---------------------------------------------------------------------------

(def ^:private tunnel-detail-keys
  "SSH tunnel detail keys propagated into the flat conn-spec so that query,
  sync, and transform paths can open a tunnel via [[with-ssh-tunnel-conn-spec]]."
  [:tunnel-enabled :tunnel-host :tunnel-port :tunnel-user :tunnel-pass
   :tunnel-auth-option :tunnel-private-key :tunnel-private-key-passphrase
   :tunnel-known-hosts])

(def ^:private extra-driver-keys
  "Driver-specific conn-spec keys that ride along from db-details so the HTTP
  client and connection pool can act on them. TLS keys only matter when
  ``:use-ssl`` is set; ``:session-sql`` is applied to each fresh pooled conn."
  [:session-sql :trust-store :trust-store-password :insecure-tls])

(defn details->conn-spec
  "Normalize Metabase db-details (or an already-flat conn-spec) into the map our
  HTTP client expects: ``{:host :port :ssl :token :timeout-seconds :session-sql
  :trust-store :trust-store-password :insecure-tls}``.

  Tolerant of both spellings — Metabase details use ``:use-ssl``, while a
  recycled conn-spec uses ``:ssl`` — so it's safe to call on either. SSH tunnel
  keys are carried through so downstream operations can open a tunnel when
  needed. Driver-specific keys (``:session-sql``, TLS trust config) propagate
  too, so a pool-evicted conn-spec round-trips losslessly."
  [details]
  (merge {:host            (:host details)
          :port            (or (:port details) 9494)
          :ssl             (boolean (or (:use-ssl details) (:ssl details)))
          :token           (:token details)
          :timeout-seconds (or (:timeout-seconds details) 60)}
         (select-keys details (concat tunnel-detail-keys extra-driver-keys))))

(defn database->details
  "Resolve a Metabase database (lib metadata) to its effective connection details."
  [database]
  (driver.conn/effective-details database))

(defn database->conn-spec
  "Resolve a Metabase database (lib metadata) to a flat Quack conn-spec via
  effective-details. Carries SSH tunnel keys when present."
  [database]
  (-> database database->details details->conn-spec))

(defn with-ssh-tunnel-conn-spec
  "Run ``(f conn-spec)``, opening an SSH tunnel around ``f`` when ``details``
  enable one.

  When the tunnel is enabled, ``metabase.driver.sql-jdbc.connection.ssh-tunnel``
  rewrites ``:host``→``localhost`` and ``:port``→the tunnel's local entrance
  port, and we hand that rewritten conn-spec to ``f``; the tunnel is closed when
  ``f`` returns. When no tunnel is configured, ``f`` runs with the plain
  conn-spec. ``details`` may be raw Metabase details OR an already-flat
  conn-spec (see [[details->conn-spec]]).

  Tunneled conn-specs are tagged ``::client/no-pool?`` so the connection pool
  is bypassed: the tunnel's local forward port is ephemeral (closed when ``f``
  returns), so an idle pooled ``connection_id`` would point at a port that's
  gone on the next call. Non-tunneled specs pool normally.

  This is the single integration point that makes Metabase's SSH bastion
  feature work for this (non-JDBC) driver."
  [details f]
  (let [details (-> details
                    (ssh/resolve-known-hosts :quack)
                    ;; The tunnel forwards to details' host/port; default the
                    ;; target port so include-ssh-tunnel! never sees nil.
                    (update :port #(or % 9494)))]
    (ssh/with-ssh-tunnel [details* details]
      ;; When the tunnel is disabled, `with-ssh-tunnel` binds details* to the
      ;; unmodified details; in both cases details->conn-spec yields the
      ;; host:port the HTTP client should dial (localhost:<entrance> when
      ;; tunneled, the real host otherwise). Tag tunneled specs so the client
      ;; bypasses the pool (the local port is ephemeral).
      (let [conn-spec (-> details* details->conn-spec)
            conn-spec (if (ssh/use-ssh-tunnel? details)
                        (assoc conn-spec ::quack.client/no-pool? true)
                        conn-spec)]
        (f conn-spec)))))

;;; ---------------------------------------------------------------------------
;;; Execution primitives (tunnel-aware) — shared by transforms, persistence,
;;; uploads, and writeback actions.
;;; ---------------------------------------------------------------------------

(defn with-db-transaction
  "Run ``(f conn-spec conn-id)`` inside a ``BEGIN``/``COMMIT`` DuckDB
  transaction on a held Quack connection, tunnel-resolved from `database`.
  ``ROLLBACK`` on exception. Within `f`, execute statements via
  ``quack.client/exec-on-connection`` on the bound `conn-id`.

  This is the atomicity primitive for writeback actions (read-before / write /
  read-after) and for atomic multi-statement DDL (persistence drop+rename,
  transforms atomic-renames)."
  [database f]
  (let [details (database->details database)]
    (with-ssh-tunnel-conn-spec details
      (fn [cs]
        (quack.client/with-transaction [conn-id cs]
          (f cs conn-id))))))
