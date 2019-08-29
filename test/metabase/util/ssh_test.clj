(ns metabase.util.ssh-test
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [expectations :refer :all]
            [metabase.util.ssh :as sshu :refer :all]))

(def ^:private ssh-password "supersecret")
(def ^:private ssh-publickey "ssh_test.pub")
(def ^:private ssh-key "ssh_test")
(def ^:private ssh-key-invalid "ssh_test_invalid")
(def ^:private ssh-mock-server-with-password-port 12221)
(def ^:private ssh-mock-server-with-publickey-port 12222)
(def ^:private ssh-mock-servers-atom (atom ()))

(defn start-ssh-mock-server-with-password
  "start a ssh mock server with password auth challenge"
  {:expectations-options :before-run}
  []
  (let [password-auth (reify org.apache.sshd.server.auth.password.PasswordAuthenticator
                        (authenticate [_ username password session]
                          (= password ssh-password)))
        keypair-provider (new org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider)
        sshd (doto (org.apache.sshd.server.SshServer/setUpDefaultServer)
               (.setPort ssh-mock-server-with-password-port)
               (.setKeyPairProvider keypair-provider)
               (.setPasswordAuthenticator password-auth))]
    (log/debug "ssh mock server (with password) started")
    (swap! ssh-mock-servers-atom conj sshd)
    (.start sshd)))

(defn start-ssh-mock-server-with-publickey
  "start a ssh mock server with public key auth challenge"
  {:expectations-options :before-run}
  []
  (let [keypair-provider (new org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider)
        publickey-file (io/file (io/resource ssh-publickey))
        publickey-auth (new org.apache.sshd.server.config.keys.AuthorizedKeysAuthenticator
                            (.toPath publickey-file))
        sshd (doto (org.apache.sshd.server.SshServer/setUpDefaultServer)
               (.setPort ssh-mock-server-with-publickey-port)
               (.setKeyPairProvider keypair-provider)
               (.setPublickeyAuthenticator publickey-auth))]
    (log/debug "ssh mock server (with publickey) started")
    (swap! ssh-mock-servers-atom conj sshd)
    (.start sshd)))

(defn shutdown-ssh-mock-servers
  "shutdown all ssh mock servers"
  {:expectations-options :after-run}
  []
  (doseq [mock-server @ssh-mock-servers-atom]
    (when-not (nil? mock-server)
      (.stop mock-server)))
  (log/debug "ssh mock server(s) stopped"))

;; correct password
(expect
  (start-ssh-tunnel
    {:tunnel-host "127.0.0.1"
     :tunnel-port ssh-mock-server-with-password-port
     :tunnel-pass ssh-password
     :host "127.0.0.1"
     :port 1234}))

;; incorrect password
(expect
  (more-of ex
           com.jcraft.jsch.JSchException ex
           "Auth fail" (.getMessage ex))
  (start-ssh-tunnel
    {:tunnel-host "127.0.0.1"
     :tunnel-port ssh-mock-server-with-password-port
     :tunnel-pass (str ssh-password "invalid")
     :host "127.0.0.1"
     :port 1234}))

;; correct ssh key
(expect
  (start-ssh-tunnel
    {:tunnel-host "127.0.0.1"
     :tunnel-port ssh-mock-server-with-publickey-port
     :tunnel-private-key-file-name (.getAbsolutePath (io/file (io/resource ssh-key)))
     :host "127.0.0.1"
     :port 1234}))

;; incorrect ssh key
(expect
  (more-of ex
           com.jcraft.jsch.JSchException ex
           "Auth fail" (.getMessage ex))
  (start-ssh-tunnel
    {:tunnel-host "127.0.0.1"
     :tunnel-port ssh-mock-server-with-publickey-port
     :tunnel-private-key-file-name (.getAbsolutePath (io/file (io/resource ssh-key-invalid)))
     :host "127.0.0.1"
     :port 1234}))
