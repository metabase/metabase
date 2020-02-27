(ns macos-release.notarize
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.string :as str]
            [environ.core :as env]
            [macos-release.common :as c]))

(def ^:private asc-provider "BR27ZJK7WW")

(defn- apple-id []
  (or (env/env :metabase-mac-app-build-apple-id)
      (throw (ex-info "Please set the METABASE_MAC_APP_BUILD_APPLE_ID env var." {}))))

(def ^:private keychain-password "@keychain:METABASE_MAC_APP_BUILD_PASSWORD")

(defn- notarize-file!
  "Returns request UUID."
  [filename]
  (c/step (format "Notarize %s" (c/assert-file-exists filename))
    (let [lines (c/sh "xcrun" "altool" "--notarize-app"
                      "--primary-bundle-id" "com.metabase.Metabase"
                      "--username" (apple-id)
                      "--password" keychain-password
                      "--asc-provider" asc-provider
                      "--file" filename)]
      (some (fn [line]
              (when-let [[_ uuid] (re-matches #"RequestUUID = ([\w-]+)" line)]
                uuid))
            lines))))

(defn- notarization-status
  "Returns a map with string keys like `LogFileURL` and `Status`."
  [uuid]
  (reduce (fn [m line]
            (if-let [[_ k v] (re-matches #"^(.+):\s+(.+)$" line)]
              (assoc m (str/trim k) (str/trim v))
              m))
          {}
          (c/sh "xcrun" "altool" "--notarization-info" uuid
                "-u" (apple-id)
                "-p" keychain-password
                "-asc-provider" asc-provider)))

(def ^:private notarization-timeout-ms (* 5 60 1000)) ; five minutes

(defn notarization-log-info
  "Comes back as a map."
  [url]
  (-> (http/get url)
      :body
      (json/parse-string true)))

(defn- wait-for-notarization [uuid]
  (c/step (format "Wait for notarization for %s" uuid)
    (let [start-time (System/currentTimeMillis)]
      (loop []
        (let [duration (- (System/currentTimeMillis) start-time)]
          (when (> duration notarization-timeout-ms)
            (throw (ex-info "Notarization timed out." {}))))
        (let [{status "Status", log-url "LogFileURL", :as status-map} (notarization-status uuid)]
          (condp = status
            "in progress"
            (do (Thread/sleep 5000)
                (recur))

            "success"
            (c/announce "Notarization successful.")

            (let [error-info (try
                               (some-> log-url notarization-log-info)
                               (catch Throwable e
                                 (locking println (println "Error fetching log info:" e))
                                 nil))]
              (try
                (some->> log-url (c/sh "open"))
                (catch Throwable _))
              (throw (ex-info "Notarization error."
                       {:uuid     uuid
                        :status   status-map
                        :log-info error-info})))))))))

(defn- staple-notarization! [filename]
  (c/step (format "Staple notarization to %s" (c/assert-file-exists filename))
    (c/sh "xcrun" "stapler" "staple" "-v" filename)
    (c/announce "Notarization stapled successfully.")))

(defn- verify-notarization
  "Verify that an app is Signed & Notarized correctly. See https://help.apple.com/xcode/mac/current/#/dev1cc22a95c"
  [filename]
  (c/step (format "Verify notarization for %s" (c/assert-file-exists filename))
    (let [source (some (fn [line]
                         (when-let [[_ source] (re-matches #"^source=(.+)$" line)]
                           (str/trim source)))
                       (c/sh "spctl" "-a" "-v" filename))]
      (assert (= source "Notarized Developer ID") (format "Unexpected source: %s" (pr-str source))))
    (c/announce "Verification successful.")))

(defn notarize! []
  (c/step "Notarize"
    (let [dmg-request-uuid (notarize-file! (c/artifact "Metabase.dmg"))
          zip-request-uuid (notarize-file! (c/artifact "Metabase.zip"))]
      (wait-for-notarization dmg-request-uuid)
      (wait-for-notarization zip-request-uuid))
    (staple-notarization! (c/artifact "Metabase.dmg"))
    (verify-notarization (c/artifact "Metabase.app"))))

(defn- notarization-history
  "Provided primarily for REPL usage."
  []
  (c/sh "xcrun" "altool"
        "--notarization-history" "0"
        "-u" (apple-id)
        "-p" keychain-password
        "--asc-provider" asc-provider))
