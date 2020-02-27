(ns macos-release.codesign
  (:require [clojure.string :as str]
            [macos-release.common :as c]))

(def ^:private codesigning-identity "Developer ID Application: Metabase, Inc")

(defn- entitlements-file []
  (c/assert-file-exists (str c/macos-source-dir "/Metabase/Metabase.entitlements")))

(defn- codesign-file! [filename]
  (c/step (format "Code sign %s" filename)
    (c/sh "codesign" "--force" "--verify"
          #_"-vvv"
          "--sign" codesigning-identity
          "-r=designated => anchor trusted"
          "--timestamp"
          "--options" "runtime"
          "--entitlements" (entitlements-file)
          "--deep"
          (c/assert-file-exists filename))
    (c/announce "Codesigned %s." filename)))

(defn verify-codesign [filename]
  (c/step (format "Verify code signature of %s" filename)
    (c/sh "codesign" "--verify" "--deep"
          "--display"
          "--strict"
          #_"--verbose=4"
          (c/assert-file-exists filename))
    ;; double
    (c/step "Check codesigning status with the System Policy Security Tool"
      (c/sh "spctl" "--assess"
            #_"--verbose=4"
            "--type" "exec"
            filename))
    (when (str/ends-with? filename "Metabase.app")
      (doseq [file ["/Contents/MacOS/Metabase"
                    "/Contents/Frameworks/Sparkle.framework/Versions/Current/Resources/Autoupdate.app"
                    "/Contents/Frameworks/Sparkle.framework/Versions/Current/Resources/Autoupdate.app/Contents/MacOS/Autoupdate"
                    "/Contents/Frameworks/Sparkle.framework/Versions/A/Resources/Autoupdate.app/Contents/MacOS/Autoupdate"]]
        (verify-codesign (str filename file))))
    (c/announce "Codesign for %s is valid." filename)))

(defn codesign! []
  (c/step "Codesign"
    (let [app         (c/assert-file-exists (c/artifact "Metabase.app"))
          sparkle-app (c/assert-file-exists (str app "/Contents/Frameworks/Sparkle.framework/Versions/A/Resources/AutoUpdate.app"))]
      (doseq [file [sparkle-app app]]
        (codesign-file! file)
        (verify-codesign file)))))
