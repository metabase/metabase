(ns metabase.driver.test-util
  (:require
   [mb.hawk.parallel]
   [metabase.driver.events.report-timezone-updated]
   [metabase.test.initialize :as initialize])
  (:import
   (org.apache.sshd.server SshServer)
   (org.apache.sshd.server.forward AcceptAllForwardingFilter)))

(set! *warn-on-reflection* true)

(defn -notify-all-databases-updated! []
  (mb.hawk.parallel/assert-test-is-not-parallel `-notify-all-databases-updated!)
  ;; It makes sense to notify databases only if app db is initialized.
  (when (initialize/initialized? :db)
    (initialize/initialize-if-needed! :plugins)
    (#'metabase.driver.events.report-timezone-updated/notify-all-databases-updated)))

(defmacro wrap-notify-all-databases-updated!
  [& body]
  `(do
     (-notify-all-databases-updated!)
     (try
       ~@body
       (finally
         (-notify-all-databases-updated!)))))

(defn basic-auth-ssh-server
  ;^java.io.Closeable
  ^SshServer
  [username password]
  (try
    (let [password-auth    (reify org.apache.sshd.server.auth.password.PasswordAuthenticator
                             (authenticate [_ auth-username auth-password _session]
                               (and
                                (= auth-username username)
                                (= auth-password password))))
          keypair-provider (org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider.)
          sshd             (doto (SshServer/setUpDefaultServer)
                             (.setPort 0)
                             (.setKeyPairProvider keypair-provider)
                             (.setPasswordAuthenticator password-auth)
                             (.setForwardingFilter AcceptAllForwardingFilter/INSTANCE)
                             .start)]
      sshd)
    (catch Throwable e
      (throw (ex-info (format "Error starting SSH mock server with password")
                      {:username username :password password}
                      e)))))
