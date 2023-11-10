(ns i18n.create-artifacts
  (:require
   [i18n.common :as i18n]
   [i18n.create-artifacts.backend :as backend]
   [i18n.create-artifacts.frontend :as frontend]
   [metabuild-common.core :as u]))

(defn- create-artifacts-for-locale! [locale]
  (u/step (format "Create artifacts for locale %s" (pr-str locale))
    (frontend/create-artifact-for-locale! locale)
    (backend/create-artifact-for-locale! locale)
    (u/announce "Artifacts for locale %s created successfully." (pr-str locale))))

(defn- create-artifacts-for-all-locales! []
  ;; Empty directory in case some locales were removed
  (u/delete-file-if-exists! backend/target-directory)
  (u/delete-file-if-exists! frontend/target-directory)
  (doseq [locale (i18n/locales)]
    (create-artifacts-for-locale! locale)))

(defn create-all-artifacts!
  "Create backend and frontend i18n artifacts."
  ([]
   (create-all-artifacts! nil))

  ([_options]
   (u/step "Create i18n artifacts"
     (create-artifacts-for-all-locales!)
     (u/announce "Translation resources built successfully."))))
