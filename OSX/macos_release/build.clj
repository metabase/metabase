(ns macos-release.build
  (:require [clojure.string :as str]
            [macos-release.common :as c]))

(def ^String info-plist-file
  (c/assert-file-exists (str c/macos-source-dir "/Metabase/Metabase-Info.plist")))

(def ^String export-options-plist-file
  (c/assert-file-exists (str c/macos-source-dir "/exportOptions.plist")))

(def ^String xcode-project-file
  (c/assert-file-exists (str c/macos-source-dir "/Metabase.xcodeproj")))

(defn- plist-buddy
  "Run a `PlistBuddy` command."
  [plist-file command]
  (let [[out] (c/sh (c/assert-file-exists "/usr/libexec/PlistBuddy")
                    "-c" (str command)
                    (c/assert-file-exists plist-file))]
    (some-> out str/trim)))

(defn- plist-value
  "Fetch value `k` from a Plist file.

    (plist-value config/info-plist-file \"CFBundleVersion\") ; -> \"0.34.2.0\""
  [plist-filename k]
  (plist-buddy plist-filename (format "Print %s" (str k))))

(defn- set-plist-value!
  "Set value of `k` in a Plist file. Verifies version is set correctly."
  [plist-filename k v]
  (plist-buddy plist-filename (format "Set %s %s" (str k) (str v)))
  (assert (= (plist-value plist-filename k) v))
  v)

(defn- xcode-build [& args]
  (apply c/sh "xcodebuild" "-UseNewBuildSystem=NO" args))

(defn- set-version! []
  (c/step (format "Bump version from %s -> %s" (plist-value info-plist-file "CFBundleVersion") (c/version))
    (set-plist-value! info-plist-file "CFBundleVersion" (c/version))
    (set-plist-value! info-plist-file "CFBundleShortVersionString" (c/version))))

(defn- clean! []
  (c/step "Clean XCode build artifacts"
    (xcode-build "-project" xcode-project-file "clean")
    (c/delete-file! c/artifacts-directory)))

(defn- build-xcarchive! []
  (let [filename (c/artifact "Metabase.xcarchive")]
    (c/delete-file! filename)
    (c/step (format "Build %s" filename)
      (xcode-build "-project"       xcode-project-file
                   "-scheme"        "Metabase"
                   "-configuration" "Release"
                   "-archivePath"   filename
                   "archive")
      (c/assert-file-exists filename))))

(defn- build-app! []
  (let [filename (c/artifact "Metabase.app")]
    (c/delete-file! filename)
    (c/step (format "Create %s" filename)
      (xcode-build "-exportArchive"
                   "-exportOptionsPlist" export-options-plist-file
                   "-archivePath"        (c/assert-file-exists (c/artifact "Metabase.xcarchive"))
                   "-exportPath"         c/artifacts-directory)
      (c/assert-file-exists filename))))

(defn build! []
  (c/step "Build artifacts"
    (c/assert-file-exists (str c/macos-source-dir "/Metabase/jre/bin/java")
                          "Make sure you copy the JRE it before building Mac App (see build instructions)")
    (set-version!)
    (clean!)
    (build-xcarchive!)
    (build-app!)
    (c/announce "Metabase.app built sucessfully.")))
