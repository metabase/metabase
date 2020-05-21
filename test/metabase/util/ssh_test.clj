(ns metabase.util.ssh-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [clojure.tools.logging :as log]
            [metabase.util.ssh :as sshu])
  (:import (java.io BufferedReader InputStreamReader PrintWriter)
           (java.net InetSocketAddress ServerSocket Socket)
           org.apache.sshd.server.forward.AcceptAllForwardingFilter))

(def ^:private ssh-username "jsmith")
(def ^:private ssh-password "supersecret")
(def ^:private ssh-publickey "ssh/ssh_test.pub")
(def ^:private ssh-key "ssh/ssh_test")
(def ^:private ssh-key-invalid "ssh/ssh_test_invalid")
(def ^:private ssh-publickey-passphrase "ssh/ssh_test_passphrase.pub")
(def ^:private ssh-key-with-passphrase "ssh/ssh_test_passphrase")
(def ^:private ssh-key-passphrase "Password1234")
(def ^:private ssh-mock-server-with-password-port 12221)
(def ^:private ssh-mock-server-with-publickey-port 12222)
(def ^:private ssh-mock-server-with-publickey-passphrase-port 12223)

;;--------------
;; mock ssh server fixtures
;;--------------

(defn start-ssh-mock-server-with-password
  "start a ssh mock server with password auth challenge"
  []
  (let [password-auth (reify org.apache.sshd.server.auth.password.PasswordAuthenticator
                        (authenticate [_ username password session]
                          (and
                           (= username ssh-username)
                           (= password ssh-password))))
        keypair-provider (new org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider)
        sshd (doto (org.apache.sshd.server.SshServer/setUpDefaultServer)
               (.setPort ssh-mock-server-with-password-port)
               (.setKeyPairProvider keypair-provider)
               (.setPasswordAuthenticator password-auth))]
    (log/debug "ssh mock server (with password) started")
    (.start sshd)
    sshd))

(defn start-ssh-mock-server-with-publickey
  "start a ssh mock server with public key auth challenge"
  [pubkey port]
  (let [keypair-provider (new org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider)
        publickey-file (io/file (io/resource pubkey))
        publickey-auth (new org.apache.sshd.server.config.keys.AuthorizedKeysAuthenticator
                            (.toPath publickey-file))
        sshd (doto (org.apache.sshd.server.SshServer/setUpDefaultServer)
               (.setPort port)
               (.setKeyPairProvider keypair-provider)
               (.setPublickeyAuthenticator publickey-auth)
               (.setForwardingFilter AcceptAllForwardingFilter/INSTANCE))]
    (log/debug "ssh mock server (with publickey) started")
    (.start sshd)
    sshd))

(use-fixtures :once
  (fn [f]
    (let [servers [(start-ssh-mock-server-with-password)
                   (start-ssh-mock-server-with-publickey ssh-publickey ssh-mock-server-with-publickey-port)
                   (start-ssh-mock-server-with-publickey ssh-publickey-passphrase ssh-mock-server-with-publickey-passphrase-port)]]
      (try (f)
           (finally
             (doseq [server servers]
               (try
                 (when server
                   (.stop server))
                 (catch Exception e
                   (log/error e)))))))))

;;--------------
;; tests
;;--------------

;; correct password
(deftest connects-with-correct-password
  (sshu/start-ssh-tunnel!
   {:tunnel-user ssh-username
    :tunnel-host "127.0.0.1"
    :tunnel-port ssh-mock-server-with-password-port
    :tunnel-pass ssh-password
    :host "127.0.0.1"
    :port 1234}))

;; incorrect password
(deftest throws-exception-on-incorrect-password
  (is (thrown? org.apache.sshd.common.SshException
               (sshu/start-ssh-tunnel!
                {:tunnel-user ssh-username
                 :tunnel-host "127.0.0.1"
                 :tunnel-port ssh-mock-server-with-password-port
                 :tunnel-pass (str ssh-password "invalid")
                 :host "127.0.0.1"
                 :port 1234}))))

;; correct ssh key
(deftest connects-with-correct-ssh-key
  (sshu/start-ssh-tunnel!
   {:tunnel-user ssh-username
    :tunnel-host "127.0.0.1"
    :tunnel-port ssh-mock-server-with-publickey-port
    :tunnel-private-key (slurp (io/resource ssh-key))
    :host "127.0.0.1"
    :port 1234}))

;; incorrect ssh key
(deftest throws-exception-on-incorrect-ssh-key
  (is (thrown? org.apache.sshd.common.SshException
               (sshu/start-ssh-tunnel!
                {:tunnel-user ssh-username
                 :tunnel-host "127.0.0.1"
                 :tunnel-port ssh-mock-server-with-publickey-port
                 :tunnel-private-key (slurp (io/resource ssh-key-invalid))
                 :host "127.0.0.1"
                 :port 1234}))))

;; correct ssh key
(deftest connects-with-correct-ssh-key-and-passphrase
  (sshu/start-ssh-tunnel!
   {:tunnel-user ssh-username
    :tunnel-host "127.0.0.1"
    :tunnel-port ssh-mock-server-with-publickey-passphrase-port
    :tunnel-private-key (slurp (io/resource ssh-key-with-passphrase))
    :tunnel-private-key-passphrase ssh-key-passphrase
    :host "127.0.0.1"
    :port 1234}))

(deftest throws-exception-on-incorrect-ssh-key-and-passphrase
  (is (thrown? java.io.StreamCorruptedException
               (sshu/start-ssh-tunnel!
                {:tunnel-user ssh-username
                 :tunnel-host "127.0.0.1"
                 :tunnel-port ssh-mock-server-with-publickey-passphrase-port
                 :tunnel-private-key (slurp (io/resource ssh-key-with-passphrase))
                 :tunnel-private-key-passphrase "this-is-the-wrong-passphrase"
                 :host "127.0.0.1"
                 :port 1234}))))

(deftest ssh-tunnel-works
  (testing "ssh tunnel can properly tunnel"
    ;; this will try to open a TCP connection via the tunnel. If it fails,
    (sshu/with-ssh-tunnel [details-with-tunnel {:tunnel-enabled true
                                                :tunnel-user ssh-username
                                                :tunnel-host "127.0.0.1"
                                                :tunnel-port ssh-mock-server-with-publickey-passphrase-port
                                                :tunnel-private-key (slurp (io/resource ssh-key-with-passphrase))
                                                :tunnel-private-key-passphrase ssh-key-passphrase
                                                :host "127.0.0.1"
                                                :port 41414}]
      (with-open [server (doto (ServerSocket. 41414)
                           (.setSoTimeout 10000))
                  socket (Socket.)]
        (let [server-thread (future (with-open [client-socket (.accept server)
                                                out-server (PrintWriter. (.getOutputStream client-socket) true)]
                                      (.println out-server "hello from the ssh tunnel")))]
          (.connect socket (InetSocketAddress. "127.0.0.1" (:tunnel-entrance-port details-with-tunnel)) 3000)
          ;; cause our future to run to completion
          @server-thread
          (with-open [in-client (BufferedReader. (InputStreamReader. (.getInputStream socket)))]
            (is (= "hello from the ssh tunnel" (.readLine in-client)))))))))
