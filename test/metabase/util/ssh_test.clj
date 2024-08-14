(ns ^:mb/once metabase.util.ssh-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.ssh :as ssh])
  (:import
   (java.io BufferedReader InputStreamReader PrintWriter)
   (java.net InetSocketAddress ServerSocket Socket)
   (org.apache.sshd.server SshServer)
   (org.apache.sshd.server.forward AcceptAllForwardingFilter)))

(set! *warn-on-reflection* true)

(def ssh-username "jsmith")
(def ssh-password "supersecret")
(def ssh-mock-server-with-password-port "mock port" 12221)
(def ^:private ssh-publickey "test_resources/ssh/ssh_test.pub")
(def ^:private ssh-key "test_resources/ssh/ssh_test")
(def ^:private ssh-key-invalid "test_resources/ssh/ssh_test_invalid")
(def ^:private ssh-publickey-passphrase "test_resources/ssh/ssh_test_passphrase.pub")
(def ^:private ssh-key-with-passphrase "test_resources/ssh/ssh_test_passphrase")
(def ^:private ssh-key-passphrase "Password1234")
(def ^:private ssh-mock-server-with-publickey-port 12222)   ; ED25519 pubkey
(def ^:private ssh-mock-server-with-publickey-passphrase-port 12223) ; RSA pubkey

;;--------------
;; mock ssh server fixtures
;;--------------

(defn- start-ssh-mock-server-with-password!
  "start a ssh mock server with password auth challenge"
  []
  (try
    (let [password-auth    (reify org.apache.sshd.server.auth.password.PasswordAuthenticator
                             (authenticate [_ username password _session]
                               (and
                                (= username ssh-username)
                                (= password ssh-password))))
          keypair-provider (org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider.)
          sshd             (doto (SshServer/setUpDefaultServer)
                             (.setPort ssh-mock-server-with-password-port)
                             (.setKeyPairProvider keypair-provider)
                             (.setPasswordAuthenticator password-auth)
                             (.setForwardingFilter AcceptAllForwardingFilter/INSTANCE)
                             .start)]
      (log/debug "ssh mock server (with password) started")
      sshd)
    (catch Throwable e
      (throw (ex-info (format "Error starting SSH mock server with password on port %d" ssh-mock-server-with-password-port)
                      {:port ssh-mock-server-with-password-port}
                      e)))))

(defn- start-ssh-mock-server-with-public-key!
  "start a ssh mock server with public key auth challenge"
  [pubkey port]
  (try
    (let [keypair-provider (new org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider)
          publickey-file   (io/file pubkey)
          publickey-auth   (org.apache.sshd.server.config.keys.AuthorizedKeysAuthenticator. (.toPath publickey-file))
          sshd             (doto (SshServer/setUpDefaultServer)
                             (.setPort port)
                             (.setKeyPairProvider keypair-provider)
                             (.setPublickeyAuthenticator publickey-auth)
                             (.setForwardingFilter AcceptAllForwardingFilter/INSTANCE)
                             .start)]
      (log/debug "ssh mock server (with publickey) started")
      sshd)
    (catch Throwable e
      (throw (ex-info (format "Error starting SSH mock server with public key on port %d" port)
                      {:port port}
                      e)))))

(defonce ^:private servers* (atom nil))

(defn- stop-mock-servers! []
  (doseq [^SshServer server @servers*]
    (try
      (log/debugf "Stop mock server %s" server)
      (.stop server)
      (catch Exception e
        (log/error e "Error stopping mock server"))))
  (reset! servers* nil))

(defn- start-mock-servers! []
  (try
    (doseq [start-server! [start-ssh-mock-server-with-password!
                           #(start-ssh-mock-server-with-public-key!
                             ssh-publickey ssh-mock-server-with-publickey-port)
                           #(start-ssh-mock-server-with-public-key!
                             ssh-publickey-passphrase ssh-mock-server-with-publickey-passphrase-port)]]
      (let [server (start-server!)]
        (log/debugf "Started mock server %s" server)
        (swap! servers* conj server)))
    (catch Throwable e
      (log/error e "Error starting servers")
      (throw (ex-info "Error starting mock server" {} e)))))

(defn do-with-mock-servers
  "Fixture to start and stop mock ssh servers."
  [thunk]
  (try
    (stop-mock-servers!)
    (start-mock-servers!)
    (thunk)
    (finally
      (stop-mock-servers!))))

(use-fixtures :once do-with-mock-servers)

;;--------------
;; tests
;;--------------

;; correct password
(deftest connects-with-correct-password
  (#'ssh/start-ssh-tunnel!
   {:tunnel-user ssh-username
    :tunnel-host "127.0.0.1"
    :tunnel-port ssh-mock-server-with-password-port
    :tunnel-pass ssh-password
    :host        "127.0.0.1"
    :port        1234}))

;; incorrect password
(deftest throws-exception-on-incorrect-password
  (is (thrown?
       org.apache.sshd.common.SshException
       (#'ssh/start-ssh-tunnel!
        {:tunnel-user ssh-username
         :tunnel-host "127.0.0.1"
         :tunnel-port ssh-mock-server-with-password-port
         :tunnel-pass (str ssh-password "invalid")
         :host        "127.0.0.1"
         :port        1234}))))

;; correct ssh key
(deftest connects-with-correct-ssh-key
  (is (some?
       (#'ssh/start-ssh-tunnel!
        {:tunnel-user        ssh-username
         :tunnel-host        "127.0.0.1"
         :tunnel-port        ssh-mock-server-with-publickey-port
         :tunnel-private-key (slurp ssh-key)
         :host               "127.0.0.1"
         :port               1234}))))

;; incorrect ssh key
(deftest throws-exception-on-incorrect-ssh-key
  (is (thrown?
       org.apache.sshd.common.SshException
       (#'ssh/start-ssh-tunnel!
        {:tunnel-user        ssh-username
         :tunnel-host        "127.0.0.1"
         :tunnel-port        ssh-mock-server-with-publickey-port
         :tunnel-private-key (slurp ssh-key-invalid)
         :host               "127.0.0.1"
         :port               1234}))))

;; correct ssh key
(deftest connects-with-correct-ssh-key-and-passphrase
  (is (some?
       (#'ssh/start-ssh-tunnel!
        {:tunnel-user                   ssh-username
         :tunnel-host                   "127.0.0.1"
         :tunnel-port                   ssh-mock-server-with-publickey-passphrase-port
         :tunnel-private-key            (slurp ssh-key-with-passphrase)
         :tunnel-private-key-passphrase ssh-key-passphrase
         :host                          "127.0.0.1"
         :port                          1234}))))

(deftest throws-exception-on-incorrect-ssh-key-and-passphrase
  (is (thrown?
       java.io.StreamCorruptedException
       (#'ssh/start-ssh-tunnel!
        {:tunnel-user                   ssh-username
         :tunnel-host                   "127.0.0.1"
         :tunnel-port                   ssh-mock-server-with-publickey-passphrase-port
         :tunnel-private-key            (slurp ssh-key-with-passphrase)
         :tunnel-private-key-passphrase "this-is-the-wrong-passphrase"
         :host                          "127.0.0.1"
         :port                          1234}))))

(deftest connects-with-default-tunnel-port-test
  (with-redefs [ssh/default-ssh-tunnel-port ssh-mock-server-with-password-port]
    (#'ssh/start-ssh-tunnel!
     {:tunnel-user ssh-username
      :tunnel-host "127.0.0.1"
      :tunnel-pass ssh-password
      :host        "127.0.0.1"
      :port        1234})))

(deftest ssh-tunnel-works
  (testing "ssh tunnel can properly tunnel"
    (with-open [server (doto (ServerSocket. 0) ; 0 -- let ServerSocket pick a random port
                         (.setSoTimeout 10000))
                socket (Socket.)]
      (let [port          (.getLocalPort server)
            server-thread (future (with-open [client-socket (.accept server)
                                              out-server    (PrintWriter. (.getOutputStream client-socket) true)]
                                    (.println out-server "hello from the ssh tunnel")))]
        ;; this will try to open a TCP connection via the tunnel.
        (ssh/with-ssh-tunnel [details-with-tunnel {:tunnel-enabled                true
                                                   :tunnel-user                   ssh-username
                                                   :tunnel-host                   "127.0.0.1"
                                                   :tunnel-port                   ssh-mock-server-with-publickey-passphrase-port
                                                   :tunnel-private-key            (slurp ssh-key-with-passphrase)
                                                   :tunnel-private-key-passphrase ssh-key-passphrase
                                                   :host                          "127.0.0.1"
                                                   :port                          port}]
          (.connect socket (InetSocketAddress. "127.0.0.1" ^Integer (:tunnel-entrance-port details-with-tunnel)) 3000)
          ;; cause our future to run to completion
          (u/deref-with-timeout server-thread 12000)
          (with-open [in-client (BufferedReader. (InputStreamReader. (.getInputStream socket)))]
            (is (= "hello from the ssh tunnel" (.readLine in-client)))))))))
