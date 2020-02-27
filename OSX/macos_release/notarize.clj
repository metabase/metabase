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

(defn- notarize-files! []
  (c/announce "Notarizing files...")
  (c/announce "TODO"))

(defn- verify-notarization []
  (c/announce "Verifying notarization...")
  (c/announce "TODO"))

(defn- notarize-file!
  "Returns request UUID."
  [filename]
  (c/announce "Notarizing %s..." (c/assert-file-exists filename))
  (let [lines (c/non-zero-sh "xcrun" "altool" "--notarize-app"
                             "--primary-bundle-id" "com.metabase.Metabase"
                             "--username" (apple-id)
                             "--password" keychain-password
                             "--asc-provider" asc-provider
                             "--file" filename)]
    (some (fn [line]
            (when-let [[_ uuid] (re-matches #"RequestUUID = ([\w-]+)" line)]
              uuid))
          lines)))

(defn- notarization-status
  "Returns a map with string keys like `LogFileURL` and `Status`."
  [uuid]
  (reduce (fn [m line]
            (if-let [[_ k v] (re-matches #"^(.+):\s+(.+)$" line)]
              (assoc m (str/trim k) (str/trim v))
              m))
          {}
          (c/non-zero-sh "xcrun" "altool" "--notarization-info" %uuid%
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

          "success??"
          (c/announce "Notarization successful.")

          (throw (ex-info "Notarization error."
                   {:uuid     uuid
                    :status   status-map
                    :log-info (try
                                (some-> log-url notarization-log-info)
                                (catch Throwable e
                                  (locking println (println "Error fetching log info:" e))
                                  nil))})))))))

(defn- verify-notarization [])

(defn- staple-notarization! [filename])

(defn- verify-notarization!
  "Verify that an app is Signed & Notarized correctly. See https://help.apple.com/xcode/mac/current/#/dev1cc22a95c"
  [filename])

(defn notarize! []
  (let [zip-request-uuid (future (notarize-file! (c/artifact "Metabase.zip")))
        dmg-request-uuid (future (notarize-file! (c/artifact "Metabase.dmg")))]
    (wait-for-notarization @zip-request-uuid)
    (wait-for-notarization @dmg-request-uuid))
  (staple-notarization! (c/artifact "Metabase.dmg"))
  (verify-notarization (c/artifact "Metabase.app")))

(def %uuid% "16864460-9b9a-46a7-9679-df38c4c03bf9")
(def %url% "https://osxapps-ssl.itunes.apple.com/itunes-assets/Enigma114/v4/4e/f1/fa/4ef1fa70-07a9-3df2-4ba6-82182153696d/developer_log.json?accessKey=1582964950_7684362901994108076_%2FtmQfXC%2B4jVFEcSnYuZrfNvr05QOSzSTXy6XVbkuq6e8hi9z3H5PWtKPIXeoF6riaYvIm5hktzRB8vuiie92LgNivESB44NutxYLYn2zaEZEm7CsMQo1oZP%2FnCKhEsOAN04dhyflOq8Un12DuGV5uzmfhAjr1xC04FKlx3BER6Y%3D")
