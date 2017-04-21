(ns metabase.util.ssh
  (:require [clojure.tools.logging :as log]
            [metabase.util :as u])
  (:import com.jcraft.jsch.JSch))

(def default-ssh-timeout 30000)

(defn start-ssh-tunnel
  [{:keys [tunnel-host tunnel-port tunnel-user tunnel-pass host port]}]
  (let [connection (doto (.getSession (new com.jcraft.jsch.JSch) tunnel-user tunnel-host tunnel-port)
                     (.setPassword tunnel-pass)
                     (.setConfig "StrictHostKeyChecking" "no")
                     (.connect default-ssh-timeout)
                     (.setPortForwardingL #_0 (+ 2000 (rand-int 63538)) host port)) ;; TODO bug here, only works when ssh to db host
        input-port (some-> (.getPortForwardingL connection)
                           first
                           (clojure.string/split #":")
                           first
                           (Integer.))]
   (assert (number? input-port))
    (log/info (u/format-color 'cyan "creating ssh tunnel %s@%s:%s -L %s:%s:%s" tunnel-user host tunnel-port input-port host #_<-wrong port))
    [connection input-port]))

(def ssh-tunnel-preferences
  [{:name         "tunnel-enabled"
    :display-name "Use SSH tunnel"
    :placeholder  "Enable this ssh tunnel?"
    :type         :boolean
    :default      false}
   {:name         "tunnel-host"
    :display-name "SSH tunnel host"
    :placeholder  "What hostname do you use to connect to the SSH tunnel?"}
   {:name         "tunnel-port"
    :display-name "SSH tunnel port"
    :type         :integer
    :default      22}
   {:name         "tunnel-user"
    :display-name "SSH tunnel username"
    :placeholder  "What username do you use to login to the SSH tunnel?"}
   {:name         "tunnel-pass"
    :display-name "SSH tunnel password"
    :type         :password
    :placeholder  "******"}
   #_{:name         "tunnel-private-key"
    :display-name "SSH private key to connect to the tunnel"
    :type         :string
    :placeholder  "Paste the contents of an ssh private key here"}
   #_{:name         "tunnel-private-key-file-name"
    :display-name "Path on the Metabase server to a SSH private key file to connect to the tunnel"
    :type         :string
    :placeholder  "/home/YOUR-USERNAME/.ssh/id_rsa"}])

(defn with-tunnel-config
  "Add preferences for ssh tunnels to a drivers :details-fields"
  [driver-config-map]
  (assoc driver-config-map :details-fields
    (constantly (concat ((:details-fields driver-config-map))
                        ssh-tunnel-preferences)) ))

(defn use-ssh-tunnel?
  "Is the SSH tunnel currently turned on for these connection details"
  [details]
  (:tunnel-enabled details))

(defn update-host-and-port
  "updates connection details for a data warehouse to use the ssh tunnel host and port"
  [database]
  (if (use-ssh-tunnel? database)
    (assoc database
      :port (:tunnel-entrance-port database) ;; This parameter is set dynamically when the connection is established
      :host (:tunnel-host database))
    database))

(defn with-ssh-tunnel
  "Starts an SSH tunnel, runs the supplied function with the tunnel open, then closes it"
  [{:keys [host port tunnel-host tunnel-user tunnel-pass] :as details} f]
  (log/errorf "\nbefore:\n%s\n" (with-out-str (clojure.pprint/pprint details)))
  (let [enabled? (use-ssh-tunnel? details)
        [connection tunnel-entrance-port] (when enabled? (start-ssh-tunnel details))
        details (assoc details :tunnel-entrance-port tunnel-entrance-port) ;; the input port is not known until the connection is opened
        details (update-host-and-port details)]
    (log/errorf "\nafter:\n%s\n" (with-out-str (clojure.pprint/pprint details)))
    (if enabled?
      (try
        (log/error (u/format-color 'cyan "<< OPENED NEW SSH TUNNEL >>")) ;;TODO chagne back to info
        (f details)
        (catch Exception e
          (throw e))
        (finally
          (when enabled? (.disconnect connection))
          (log/error (u/format-color 'cyan "<< CLOSED NEW SSH TUNNEL >>"))))
      (f details))))
