(ns metabase.util.ssh
  "SSH tunnel support for JDBC-based DWs. TODO -- it seems like this code is JDBC-specific, or at least big parts of
  this all. We should consider moving some or all of this code to a new namespace like
  `metabase.driver.sql-jdbc.connection.ssh-tunnel` or something like that."
  (:require
   [metabase.driver :as driver]
   [metabase.models.setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log])
  (:import
   (java.io ByteArrayInputStream)
   (java.util.concurrent TimeUnit)
   (org.apache.sshd.client SshClient)
   (org.apache.sshd.client.future ConnectFuture)
   (org.apache.sshd.client.session ClientSession)
   (org.apache.sshd.client.session.forward PortForwardingTracker)
   (org.apache.sshd.common.config.keys FilePasswordProvider
                                       FilePasswordProvider$Decoder
                                       FilePasswordProvider$ResourceDecodeResult)
   (org.apache.sshd.common.future CancelOption)
   (org.apache.sshd.common.session SessionHeartbeatController$HeartbeatType SessionHolder)
   (org.apache.sshd.common.util GenericUtils)
   (org.apache.sshd.common.util.io.resource AbstractIoResource)
   (org.apache.sshd.common.util.net SshdSocketAddress)
   (org.apache.sshd.common.util.security SecurityUtils)
   (org.apache.sshd.server.forward AcceptAllForwardingFilter)))

(defsetting ssh-heartbeat-interval-sec
  (deferred-tru "Controls how often the heartbeats are sent when an SSH tunnel is established (in seconds).")
  :visibility :public
  :type       :integer
  :default    180
  :audit      :getter)

(set! *warn-on-reflection* true)

(def default-ssh-tunnel-port
  "The default port for SSH tunnels (22) used if no port is specified"
  22)

(def ^:private ^Long default-ssh-timeout 30000)

(def ^:private ^SshClient client
  (doto (SshClient/setUpDefaultClient)
    (.start)
    (.setForwardingFilter AcceptAllForwardingFilter/INSTANCE)))

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
  callers responsibility to call [[close-tunnel!]] on the returned connection object."
  [{:keys [^String tunnel-host ^Integer tunnel-port ^String tunnel-user tunnel-pass tunnel-private-key
           tunnel-private-key-passphrase host port]}]
  {:pre [(integer? port)]}
  (let [^Integer tunnel-port       (or tunnel-port default-ssh-tunnel-port)
        ^ConnectFuture conn-future (.connect client tunnel-user tunnel-host tunnel-port)
        ^SessionHolder conn-status (.verify conn-future default-ssh-timeout no-cancel-options)
        hb-sec                     (ssh-heartbeat-interval-sec)
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
    [session tracker]))

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
    (let [[_ proto host]                           (re-find #"(.*://)?(.*)" (:host details))
          [session ^PortForwardingTracker tracker] (start-ssh-tunnel! (assoc details :host host))
          tunnel-entrance-port                     (.. tracker getBoundAddress getPort)
          tunnel-entrance-host                     (.. tracker getBoundAddress getHostName)
          orig-port                                (:port details)
          details-with-tunnel                      (assoc details
                                                          :port tunnel-entrance-port ;; This parameter is set dynamically when the connection is established
                                                          :host (str proto "localhost") ;; SSH tunnel will always be through localhost
                                                          :orig-port orig-port
                                                          :tunnel-entrance-host tunnel-entrance-host
                                                          :tunnel-entrance-port tunnel-entrance-port ;; the input port is not known until the connection is opened
                                                          :tunnel-enabled true
                                                          :tunnel-session session
                                                          :tunnel-tracker tracker)]
      details-with-tunnel)
    details))

;; TODO Seems like this definitely belongs in [[metabase.driver.sql-jdbc.connection]] or something like that.
(defmethod driver/incorporate-ssh-tunnel-details :sql-jdbc
  [_driver db-details]
  (cond
    ;; no ssh tunnel in use
    (not (use-ssh-tunnel? db-details))
    db-details

    ;; tunnel in use, and is open
    (ssh-tunnel-open? db-details)
    db-details

    ;; tunnel in use, and is not open
    :else
    (include-ssh-tunnel! db-details)))

(defn close-tunnel!
  "Close a running tunnel session"
  [details]
  (when (and (use-ssh-tunnel? details) (ssh-tunnel-open? details))
    (log/tracef "Closing SSH tunnel: %s" (:tunnel-session details))
    (.close ^ClientSession (:tunnel-session details))))

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
