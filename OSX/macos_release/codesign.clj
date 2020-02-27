(ns macos-release.codesign
  (:require [macos-release.common :as c]))

(def ^:private codesigning-identity "Developer ID Application: Metabase, Inc")

(defn- entitlements-file []
  (c/assert-file-exists (str c/macos-source-dir "/Metabase/Metabase.entitlements")))

(defn- codesign-file! [filename]
  (c/announce "Codesigning %s..." filename)
  (c/non-zero-sh
   "codesign" "--force" "--verify"
   "--sign" codesigning-identity
   "-r=designated => anchor trusted"
   "--timestamp"
   "--options" "runtime"
   "--entitlements" (entitlements-file)
   "--deep" (c/assert-file-exists filename))
  (c/announce "Codesigned %s." filename))

(defn verify-codesign [filename]
  (c/announce "Verifying codesign for %s..." filename)
  (c/non-zero-sh
   "codesign" "--verify" "--deep"
   "--display"
   "--strict"
   "--verbose=4"
   (c/assert-file-exists filename))
  (c/announce "Codesign for %s is valid." filename))

(defn codesign! []
  (let [app (c/assert-file-exists (c/artifact "Metabase.app"))]
    (codesign-file! app)
    (verify-codesign app)))
