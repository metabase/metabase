(ns macos-release.create-dmg
  (:require [macos-release.common :as c]))

(def ^:private dmg         (c/artifact "Metabase.dmg"))
(def ^:private temp-dmg    "/tmp/Metabase.dmg")
(def ^:private source-dir  "/tmp/Metabase.dmg.source")
(def ^:private mounted-dmg "/Volumes/Metabase")

(defn- clean! []
  (c/delete-file! temp-dmg source-dir dmg))

(defn- create-source-dir! []
  (c/create-directory-unless-exists! source-dir)
  (c/copy-file! (c/artifact "Metabase.app") (str source-dir "/Metabase.app")))

(defn- create-dmg-from-source-dir! []
  (c/announce "Creating %s from source dir %s..." temp-dmg source-dir)
  (c/non-zero-sh "hdiutil"    "create"
                      "-srcfolder" (str (c/assert-file-exists source-dir) "/")
                      "-volname"  "Metabase"
                      "-fs"  "HFS+"
                      "-fsargs"  "-c c=64,a=16,e=16"
                      "-format"  "UDRW"
                      ;; has to be big enough to hold everything uncompressed, but doesn't matter if there's extra
                      ;; space -- compression slims it down
                      "-size" "512MB"
                      temp-dmg)
  (c/announce "Created %s." temp-dmg))

(defn- mount-dmg! [dmg]
  (c/announce "Mounting %s..." (c/assert-file-exists dmg))
  (let [[out]      (c/non-zero-sh "hdiutil" "attach"
                                       "-readwrite" "-noverify"
                                       "-noautoopen" dmg)
        [_ device] (re-find #"(/dev/disk\d+)" out)]
    device))

(defn- unmount-dmg! [device]
  (c/announce "Unmounting device %s..." device)
  (letfn [(unmount! []
            ;; force completion of any pending disk writes
            (c/non-zero-sh "sync")
            (c/non-zero-sh "sync")
            (c/non-zero-sh "hdiutil" "detach" device))]
    (try
      (unmount!)
      (catch Throwable _
        ;; if the unmount fails at first because the device is "busy" wait a few seconds and try again
        (Thread/sleep 5000)
        (unmount!)))))

(defn- do-with-mounted-dmg [dmg f]
  (let [device (mount-dmg! dmg)]
    (try
      (f device)
      (finally
        (unmount-dmg! device)))))

(defmacro ^:private with-mounted-dmg [[device-binding dmg] & body]
  `(do-with-mounted-dmg ~dmg (fn [~device-binding] ~@body)))

(defn- add-applications-shortcut! []
  (c/assert-file-exists mounted-dmg)
  (c/non-zero-sh "osascript" (c/assert-file-exists (str c/macos-source-dir "/macos_release/addShortcut.scpt"))))

(defn- delete-temporary-files-in-dmg!
  "Delete any temporary files that might have creeped in."
  []
  (c/assert-file-exists mounted-dmg)
  (c/delete-file! (str mounted-dmg "/.Trashes")
                  (str mounted-dmg "/.fseventsd")))

(defn- set-dmg-permissions! []
  (c/non-zero-sh "chmod" "-Rf" "go-w" (c/assert-file-exists mounted-dmg)))

(defn- compress-and-copy-dmg!
  []
  (c/announce "Compressing %s -> %s" (c/assert-file-exists temp-dmg) dmg)
  (c/non-zero-sh "hdiutil" "convert" temp-dmg
                 "-format" "UDZO"
                 "-imagekey" "zlib-level-9"
                 "-o" dmg)
  (c/assert-file-exists dmg))

(defn- delete-temp-files! []
  (c/delete-file! temp-dmg source-dir))

(defn create-dmg! []
  (c/announce "Creating %s..." dmg)
  (clean!)
  (create-source-dir!)
  (create-dmg-from-source-dir!)
  (with-mounted-dmg [_ temp-dmg]
    (add-applications-shortcut!)
    (delete-temporary-files-in-dmg!)
    (set-dmg-permissions!))
  (compress-and-copy-dmg!)
  (delete-temp-files!)
  (c/announce "Successfully created %s." dmg))
