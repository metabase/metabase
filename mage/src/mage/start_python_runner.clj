(ns mage.start-python-runner
  (:require
   [babashka.http-client :as http]
   [clojure.string :as str]
   [mage.be-dev :as be-dev]
   [mage.color :as c]
   [mage.shell :as shell]))

(set! *warn-on-reflection* true)

(def ^:private container-name "mb-python-runner")
(def ^:private image-name "metabase/python-runner:latest")

(defn- kill-existing! []
  (println (c/red "Killing existing container:") container-name "...")
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

(defn- wait-for-server!
  "Wait for the python-runner server to be ready."
  []
  (print "Waiting for python-runner server")
  (flush)
  (loop [attempts 60]
    (if (zero? attempts)
      (do
        (println)
        (println (c/red "  ✗ Server failed to start after 30 seconds"))
        false)
      (let [ready? (try
                     (let [resp (http/get "http://localhost:5001/v1/status"
                                          {:throw false :timeout 1000})]
                       (= 200 (:status resp)))
                     (catch Exception _ false))]
        (if ready?
          (do
            (println)
            (println (c/green "  ✓ Server is ready"))
            true)
          (do
            (print ".")
            (flush)
            (Thread/sleep 500)
            (recur (dec attempts))))))))

(defn start-python-runner!
  "Starts the python-runner container with internal Moto S3 server."
  []
  (kill-existing!)
  (println (c/green "Starting python-runner container..."))
  (let [cmd ["docker" "run"
             "-d"
             "-p" "5001:5000"
             "-p" "4566:4566"
             "-e" "AUTH_TOKEN=dev-token-12345"
             "-e" "ENABLE_INTERNAL_S3=true"
             "--name" container-name
             image-name]]
    (println "Running:" (c/magenta (str/join " " cmd)))
    (apply shell/sh cmd)
    (println)
    (when (wait-for-server!)
      (println (c/cyan "Started python-runner on port 5001 with internal S3 on port 4566"))
      (println)
      (when (be-dev/nrepl-open?)
        (println "Configuring Metabase via nREPL...")
        (be-dev/nrepl-eval
         "metabase-enterprise.transforms-python.settings"
         "(python-storage-s-3-container-endpoint! \"http://localhost:4566\")")
        (println)))))
