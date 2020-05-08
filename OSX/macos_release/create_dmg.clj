(ns macos-release.create-dmg
  (:require [macos-release
             [codesign :as codesign]
             [common :as c]]))

(def ^:private dmg         (c/artifact "Metabase.dmg"))
(def ^:private temp-dmg    "/tmp/Metabase.dmg")
(def ^:private source-dir  "/tmp/Metabase.dmg.source")
(def ^:private mounted-dmg "/Volumes/Metabase")

(defn- copy-app-to-source-dir! []
  (c/step "Copy app to source dir"
    (c/delete-file! source-dir)
    (c/create-directory-unless-exists! source-dir)
    (let [source-app (c/assert-file-exists (c/artifact "Metabase.app"))
          dest-app   (str source-dir "/Metabase.app")]
      (c/copy-file! source-app dest-app)
      (c/assert-file-exists dest-app)
      (codesign/verify-codesign dest-app))))

(defn- create-dmg-from-source-dir! []
  (c/delete-file! temp-dmg)
  (c/step (format "Create DMG %s from source dir %s" temp-dmg source-dir)
    (c/sh "hdiutil"    "create"
          "-srcfolder" (str (c/assert-file-exists source-dir) "/")
          "-volname"  "Metabase"
          "-fs"  "HFS+"
          "-fsargs"  "-c c=64,a=16,e=16"
          "-format"  "UDRW"
          ;; has to be big enough to hold everything uncompressed, but doesn't matter if there's extra
          ;; space -- compression slims it down
          "-size" "512MB"
          temp-dmg)
    (c/announce "Created %s." temp-dmg)))

(defn- mount-dmg! [dmg {:keys [readonly?]
                        :or   {readonly? false}}]
  (c/step (format "Mount %s -> %s" (c/assert-file-exists dmg) mounted-dmg)
    (let [[out]      (c/sh "hdiutil" "attach"
                           (if readonly? "-readonly" "-readwrite")
                           "-noverify"
                           "-noautoopen" dmg)
          [_ device] (re-find #"(/dev/disk\d+)" out)]
      device)))

(defn- unmount-dmg! [device]
  (c/step (format "Unmount device %s" device)
    (letfn [(unmount! []
              ;; force completion of any pending disk writes
              (c/sh "sync")
              (c/sh "sync")
              (c/sh "hdiutil" "detach" device))]
      (try
        (unmount!)
        (catch Throwable _
          ;; if the unmount fails at first because the device is "busy" wait a few seconds and try again
          (c/announce "Wait a bit for DMG to stop being 'busy'")
          (Thread/sleep 5000)
          (unmount!))))))

(defn- do-with-mounted-dmg [dmg options f]
  (c/step (format "Mount %s" dmg)
    (let [device (mount-dmg! dmg options)]
      (try
        (f device)
        (finally
          (unmount-dmg! device))))))

(defmacro ^:private with-mounted-dmg [[device-binding dmg options] & body]
  `(do-with-mounted-dmg ~dmg ~options (fn [~device-binding] ~@body)))

(defn- add-applications-shortcut! []
  (c/assert-file-exists mounted-dmg)
  (c/sh "osascript" (c/assert-file-exists (str c/macos-source-dir "/macos_release/addShortcut.scpt"))))

(defn- delete-temporary-files-in-dmg!
  "Delete any temporary files that might have creeped in."
  []
  (c/assert-file-exists mounted-dmg)
  (c/delete-file! (str mounted-dmg "/.Trashes")
                  (str mounted-dmg "/.fseventsd")))

(defn- set-dmg-permissions! []
  (c/sh "chmod" "-Rf" "go-w" (c/assert-file-exists mounted-dmg)))

(defn- verify-dmg-codesign! []
  (codesign/verify-codesign (str mounted-dmg "/Metabase.app")))

(defn- compress-and-copy-dmg!
  []
  (c/delete-file! dmg)
  (c/step (format "Compress DMG %s -> %s" (c/assert-file-exists temp-dmg) dmg)
    (c/sh "hdiutil" "convert" temp-dmg
          "-format" "UDZO"
          "-imagekey" "zlib-level-9"
          "-o" dmg)
    (c/assert-file-exists dmg)))

(defn- delete-temp-files! []
  (c/step "Delete temp files"
    (c/delete-file! temp-dmg source-dir)))

(defn create-dmg! []
  (c/step (format "Create %s" dmg)
    (c/delete-file! dmg temp-dmg source-dir)
    (copy-app-to-source-dir!)
    (create-dmg-from-source-dir!)
    (with-mounted-dmg [_ temp-dmg]
      (add-applications-shortcut!)
      (delete-temporary-files-in-dmg!)
      (set-dmg-permissions!)
      (verify-dmg-codesign!))
    (compress-and-copy-dmg!)
    (delete-temp-files!)
    (with-mounted-dmg [_ dmg {:readonly? true}]
      (verify-dmg-codesign!))
    (c/announce "Successfully created %s." dmg)))
