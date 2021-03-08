(ns metabase.util.ssh-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [clojure.tools.logging :as log]
            [metabase.models.database :refer [Database]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.query-processor :as qp]
            [metabase.query-processor-test :as qp.test]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.ssh :as ssh]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.util :as tu])
  (:import [java.io BufferedReader InputStreamReader PrintWriter]
           [java.net InetSocketAddress ServerSocket Socket]
           org.apache.sshd.server.forward.AcceptAllForwardingFilter
           org.apache.sshd.server.SshServer
           org.h2.tools.Server))

(def ^:private ssh-username "jsmith")
(def ^:private ssh-password "supersecret")
(def ^:private ssh-publickey "test_resources/ssh/ssh_test.pub")
(def ^:private ssh-key "test_resources/ssh/ssh_test")
(def ^:private ssh-key-invalid "test_resources/ssh/ssh_test_invalid")
(def ^:private ssh-publickey-passphrase "test_resources/ssh/ssh_test_passphrase.pub")
(def ^:private ssh-key-with-passphrase "test_resources/ssh/ssh_test_passphrase")
(def ^:private ssh-key-passphrase "Password1234")
(def ^:private ssh-mock-server-with-password-port 12221)
(def ^:private ssh-mock-server-with-publickey-port 12222)
(def ^:private ssh-mock-server-with-publickey-passphrase-port 12223)

;;--------------
;; mock ssh server fixtures
;;--------------

(defn- start-ssh-mock-server-with-password!
  "start a ssh mock server with password auth challenge"
  []
  (try
    (let [password-auth    (reify org.apache.sshd.server.auth.password.PasswordAuthenticator
                             (authenticate [_ username password session]
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
    (doseq [start-server! [#(start-ssh-mock-server-with-password!)
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

(defn- do-with-mock-servers [thunk]
  (try
    (stop-mock-servers!)
    (try
      (start-mock-servers!)
      (thunk))
    (finally
      (stop-mock-servers!))))

(use-fixtures :once do-with-mock-servers)

;;--------------
;; tests
;;--------------

;; correct password
(deftest connects-with-correct-password
  (ssh/start-ssh-tunnel!
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
       (ssh/start-ssh-tunnel!
        {:tunnel-user ssh-username
         :tunnel-host "127.0.0.1"
         :tunnel-port ssh-mock-server-with-password-port
         :tunnel-pass (str ssh-password "invalid")
         :host        "127.0.0.1"
         :port        1234}))))

;; correct ssh key
(deftest connects-with-correct-ssh-key
  (is (some?
       (ssh/start-ssh-tunnel!
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
       (ssh/start-ssh-tunnel!
        {:tunnel-user        ssh-username
         :tunnel-host        "127.0.0.1"
         :tunnel-port        ssh-mock-server-with-publickey-port
         :tunnel-private-key (slurp ssh-key-invalid)
         :host               "127.0.0.1"
         :port               1234}))))

;; correct ssh key
(deftest connects-with-correct-ssh-key-and-passphrase
  (is (some?
       (ssh/start-ssh-tunnel!
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
       (ssh/start-ssh-tunnel!
        {:tunnel-user                   ssh-username
         :tunnel-host                   "127.0.0.1"
         :tunnel-port                   ssh-mock-server-with-publickey-passphrase-port
         :tunnel-private-key            (slurp ssh-key-with-passphrase)
         :tunnel-private-key-passphrase "this-is-the-wrong-passphrase"
         :host                          "127.0.0.1"
         :port                          1234}))))

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

(defn- init-h2-tcp-server [port]
  (let [args   ["-tcp" "-tcpPort", (str port), "-tcpAllowOthers" "-tcpDaemon"]
        server (Server/createTcpServer (into-array args))]
    (doto server (.start))))

(deftest test-ssh-tunnel-reconnection
  ;; for now, run against Postgres, although in theory it could run against many different kinds
  (mt/test-drivers #{:postgres :mysql}
    (testing "ssh tunnel is reestablished if it becomes closed, so subsequent queries still succeed"
      (let [tunnel-db-details (assoc (:details (mt/db))
                                     :tunnel-enabled true
                                     :tunnel-host "localhost"
                                     :tunnel-auth-option "password"
                                     :tunnel-port ssh-mock-server-with-password-port
                                     :tunnel-user ssh-username
                                     :tunnel-pass ssh-password)]
        (mt/with-temp Database [tunneled-db {:engine (tx/driver), :details tunnel-db-details}]
          (mt/with-db tunneled-db
            (sync/sync-database! (mt/db))
            (letfn [(check-row []
                      (is (= [["Polo Lounge"]]
                             (mt/rows (mt/run-mbql-query venues {:filter [:= $id 60] :fields [$name]})))))]
              ;; check that some data can be queried
              (check-row)
              ;; kill the ssh tunnel; fortunately, we have an existing function that can do that
              (ssh/close-tunnel! (sql-jdbc.conn/db->pooled-connection-spec (mt/db)))
              ;; check the query again; the tunnel should have been reestablished
              (check-row))))))))

(deftest test-ssh-tunnel-reconnection-h2
  "We need a customized version of this test for H2. It will bring up a new H2 TCP server, pointing to an existing DB
   file (stored in source control, called 'tiny-db', with a single table called 'my_tbl' and a GUEST user with
   password 'guest'); it will then use an SSH tunnel over localhost to connect to this H2 server's TCP port to execute
   native queries against that table."
  (mt/with-driver :h2
    (testing "ssh tunnel is reestablished if it becomes closed, so subsequent queries still succeed (H2 version)"
      (let [h2-port (tu/find-free-port)
            server  (init-h2-tcp-server h2-port)
            uri     (format "tcp://localhost:%d/./test_resources/ssh/tiny-db;USER=GUEST;PASSWORD=guest" h2-port)
            h2-db   {:port               h2-port
                     :host               "localhost"
                     :db                 uri
                     :tunnel-enabled     true
                     :tunnel-host        "localhost"
                     :tunnel-auth-option "password"
                     :tunnel-port        ssh-mock-server-with-password-port
                     :tunnel-user        ssh-username
                     :tunnel-pass        ssh-password}]
        (try
          (mt/with-temp Database [db {:engine :h2, :details h2-db}]
            (mt/with-db db
              (sync/sync-database! db)
              (letfn [(check-data [] (is (= {:cols [{:base_type    :type/Text
                                                     :display_name "COL1"
                                                     :field_ref    [:field "COL1" {:base-type :type/Text}]
                                                     :name         "COL1"
                                                     :source       :native}
                                                    {:base_type    :type/Decimal
                                                     :display_name "COL2"
                                                     :field_ref    [:field "COL2" {:base-type :type/Decimal}]
                                                     :name         "COL2"
                                                     :source       :native}]
                                             :rows [["First Row"  19.10M]
                                                    ["Second Row" 100.40M]
                                                    ["Third Row"  91884.10M]]}
                                            (-> {:query "SELECT col1, col2 FROM my_tbl;"}
                                                (mt/native-query)
                                                (qp/process-query)
                                                (qp.test/rows-and-cols)))))]
                ;; check that some data can be queried
                (check-data)
                ;; kill the ssh tunnel; fortunately, we have an existing function that can do that
                (ssh/close-tunnel! (sql-jdbc.conn/db->pooled-connection-spec db))
                ;; check the query again; the tunnel should have been reestablished
                (check-data))))
          (finally (.stop ^Server server)))))))
