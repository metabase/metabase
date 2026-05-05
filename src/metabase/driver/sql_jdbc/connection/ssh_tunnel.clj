(ns metabase.driver.sql-jdbc.connection.ssh-tunnel
  "SSH tunnel support for JDBC-based DWs."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.io ByteArrayInputStream)
   (java.util.concurrent TimeUnit)
   (org.apache.sshd.client SshClient)
   (org.apache.sshd.client.future ConnectFuture)
   (org.apache.sshd.client.keyverifier KnownHostsServerKeyVerifier RejectAllServerKeyVerifier)
   (org.apache.sshd.client.session ClientSession)
   (org.apache.sshd.client.session.forward PortForwardingTracker)
   (org.apache.sshd.common.config.keys FilePasswordProvider FilePasswordProvider$Decoder FilePasswordProvider$ResourceDecodeResult)
   (org.apache.sshd.common.future CancelOption)
   (org.apache.sshd.common.session SessionHeartbeatController$HeartbeatType SessionHolder)
   (org.apache.sshd.common.util GenericUtils)
   (org.apache.sshd.common.util.io.resource AbstractIoResource)
   (org.apache.sshd.common.util.net SshdSocketAddress)
   (org.apache.sshd.common.util.security SecurityUtils)
   (org.apache.sshd.server.forward AcceptAllForwardingFilter)))

(set! *warn-on-reflection* true)

(def default-ssh-tunnel-port
  "The default port for SSH tunnels (22) used if no port is specified"
  22)

(def ^:private ^Long default-ssh-timeout 30000)

(def ^:private ^SshClient default-client
  (doto (SshClient/setUpDefaultClient)
    (.start)
    (.setForwardingFilter AcceptAllForwardingFilter/INSTANCE)))

(defn- create-client-with-known-hosts
  "Create a new SshClient that verifies the server's host key against the given known_hosts content (UTF-8).
  The caller is responsible for stopping this client when the tunnel is closed."
  ^SshClient [^String known-hosts-content]
  (let [tmp-file (doto (java.io.File/createTempFile "metabase-known-hosts_" ".txt")
                   (.setReadable false false)
                   (.setReadable true true)
                   (.deleteOnExit))]
    ;; KnownHostEntry reads files as UTF-8
    (spit tmp-file known-hosts-content :encoding "UTF-8")
    (doto (SshClient/setUpDefaultClient)
      (.setServerKeyVerifier (KnownHostsServerKeyVerifier. RejectAllServerKeyVerifier/INSTANCE (.toPath tmp-file)))
      (.setForwardingFilter AcceptAllForwardingFilter/INSTANCE)
      (.start))))

(def ^:private ^"[Lorg.apache.sshd.common.future.CancelOption;" no-cancel-options
  (make-array CancelOption 0))

(defn- maybe-add-tunnel-password!
  [^ClientSession session ^String tunnel-pass]
  (when tunnel-pass
    (.addPasswordIdentity session tunnel-pass)))

(defn- maybe-add-tunnel-private-key!
  [^ClientSession session ^String tunnel-private-key tunnel-private-key-passphrase]
  (when tunnel-private-key
    (let [resource-key      (proxy [AbstractIoResource] [(class "key") "key"])
          password-provider (proxy [FilePasswordProvider] []
                              (getPassword [_ _ _]
                                tunnel-private-key-passphrase)
                              (handleDecodeAttemptResult [_ _ _ _ _]
                                FilePasswordProvider$ResourceDecodeResult/TERMINATE)
                              (decode [_ _ ^FilePasswordProvider$Decoder decoder]
                                (.decode decoder tunnel-private-key-passphrase)))
          ids               (with-open [is (ByteArrayInputStream. (.getBytes tunnel-private-key "UTF-8"))]
                              (SecurityUtils/loadKeyPairIdentities session resource-key is password-provider))
          keypair           (GenericUtils/head ids)]
      (.addPublicKeyIdentity session keypair))))

(defn- start-ssh-tunnel!
  "Opens a new ssh tunnel and returns the connection along with the dynamically assigned tunnel entrance port. It's the
  callers responsibility to call [[close-tunnel!]] on the returned connection object.

  When `:tunnel-known-hosts` is provided in the details, the server's host key is verified against it. If the key does
  not match, connection is refused. When absent, any host key is accepted (backward-compatible behavior)."
  [{:keys [^String tunnel-host ^Integer tunnel-port ^String tunnel-user tunnel-pass tunnel-private-key
           tunnel-private-key-passphrase tunnel-known-hosts host port]}]
  {:pre [(integer? port)]}
  (let [dedicated-client           (when tunnel-known-hosts
                                     (create-client-with-known-hosts tunnel-known-hosts))
        ^SshClient ssh-client      (or dedicated-client default-client)
        ^Integer tunnel-port       (or tunnel-port default-ssh-tunnel-port)
        ^ConnectFuture conn-future (.connect ssh-client tunnel-user tunnel-host tunnel-port)
        ^SessionHolder conn-status (.verify conn-future default-ssh-timeout no-cancel-options)
        hb-sec                     (driver.settings/ssh-heartbeat-interval-sec)
        session                    (doto ^ClientSession (.getSession conn-status)
                                     (maybe-add-tunnel-password! tunnel-pass)
                                     (maybe-add-tunnel-private-key! tunnel-private-key tunnel-private-key-passphrase)
                                     (.setSessionHeartbeat SessionHeartbeatController$HeartbeatType/IGNORE
                                                           TimeUnit/SECONDS
                                                           hb-sec)
                                     (.. auth (verify default-ssh-timeout no-cancel-options)))
        tracker                    (.createLocalPortForwardingTracker session
                                                                      (SshdSocketAddress. "" 0)
                                                                      (SshdSocketAddress. host port))
        input-port                 (.. tracker getBoundAddress getPort)]
    (log/trace (u/format-color 'cyan "creating ssh tunnel (heartbeating every %d seconds) %s@%s:%s -L %s:%s:%s"
                               hb-sec tunnel-user tunnel-host tunnel-port input-port host port))
    [session tracker dedicated-client]))

(defn use-ssh-tunnel?
  "Is the SSH tunnel currently turned on for these connection details"
  [details]
  (:tunnel-enabled details))

(defn ssh-tunnel-open?
  "Is the SSH tunnel currently open for these connection details?"
  [details]
  (when-let [session (:tunnel-session details)]
    (.isOpen ^ClientSession session)))

(defn include-ssh-tunnel!
  "Updates connection details for a data warehouse to use the ssh tunnel host and port
  For drivers that enter hosts including the protocol (https://host), copy the protocol over as well"
  [details]
  (if (use-ssh-tunnel? details)
    (let [[_ proto host]                                            (re-find #"(.*://)?(.*)" (:host details))
          orig-port                                                 (let [p (:port details)]
                                                                      (if (string? p) (Integer/parseInt p) p))
          [session ^PortForwardingTracker tracker dedicated-client] (start-ssh-tunnel! (assoc details :host host :port orig-port))
          tunnel-entrance-port                                      (.. tracker getBoundAddress getPort)
          tunnel-entrance-host                                      (.. tracker getBoundAddress getHostName)
          details-with-tunnel                                       (assoc details
                                                                           :port tunnel-entrance-port ;; This parameter is set dynamically when the connection is established
                                                                           :host (str proto "localhost") ;; SSH tunnel will always be through localhost
                                                                           :orig-port orig-port
                                                                           :tunnel-entrance-host tunnel-entrance-host
                                                                           :tunnel-entrance-port tunnel-entrance-port ;; the input port is not known until the connection is opened
                                                                           :tunnel-enabled true
                                                                           :tunnel-session session
                                                                           :tunnel-tracker tracker
                                                                           :tunnel-client dedicated-client)]
      details-with-tunnel)
    details))

(defn resolve-known-hosts
  "Resolve the tunnel-known-hosts secret value and assoc it as a plain string into details.
  Handles both raw string values and base64-encoded data URLs from the UI file upload."
  [db-details _driver]
  (let [raw-value (or (:tunnel-known-hosts db-details)
                      (:tunnel-known-hosts-value db-details))]
    (if raw-value
      (let [known-hosts (if (and (string? raw-value) (re-find #"^data:[^;]*;base64," raw-value))
                          (-> raw-value
                              (str/replace #"^data:[^;]*;base64," "")
                              (as-> b64 (String. (.decode (java.util.Base64/getDecoder) ^String b64) "UTF-8")))
                          raw-value)]
        (assoc db-details :tunnel-known-hosts known-hosts))
      db-details)))

(defmethod driver/incorporate-ssh-tunnel-details :sql-jdbc
  [driver db-details]
  (cond
    ;; no ssh tunnel in use
    (not (use-ssh-tunnel? db-details))
    db-details

    ;; tunnel in use, and is open
    (ssh-tunnel-open? db-details)
    db-details

    ;; tunnel in use, and is not open
    :else
    (include-ssh-tunnel! (resolve-known-hosts db-details driver))))

(defn close-tunnel!
  "Close a running tunnel session"
  [details]
  (when (and (use-ssh-tunnel? details) (ssh-tunnel-open? details))
    (log/tracef "Closing SSH tunnel: %s" (:tunnel-session details))
    (.close ^ClientSession (:tunnel-session details)))
  (when-let [^SshClient dedicated-client (:tunnel-client details)]
    (.stop dedicated-client)))

(defn do-with-ssh-tunnel
  "Starts an SSH tunnel, runs the supplied function with the tunnel open, then closes it"
  [details f]
  (if (use-ssh-tunnel? details)
    (let [details-with-tunnel (include-ssh-tunnel! details)]
      (try
        (log/trace (u/format-color 'cyan "<< OPENED SSH TUNNEL >>"))
        (f details-with-tunnel)
        (finally
          (close-tunnel! details-with-tunnel)
          (log/trace (u/format-color 'cyan "<< CLOSED SSH TUNNEL >>")))))
    (f details)))

;;; TODO -- I think `with-ssh-tunnel-details` or something like that would be a better name for this. Since it doesn't
;;; actually give you a tunnel. It just gives you connection details that include a tunnel in there.
(defmacro with-ssh-tunnel
  "Starts an ssh tunnel, and binds the supplied name to a database
  details map with it's values adjusted to use the tunnel"
  [[details-binding details] & body]
  `(do-with-ssh-tunnel ~details
                       (fn [~details-binding]
                         ~@body)))
