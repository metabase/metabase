(ns i18n.create-artifacts
  (:require [clojure.pprint :as pprint]
            [i18n.common :as i18n]
            [i18n.create-artifacts.backend :as backend]
            [i18n.create-artifacts.frontend :as frontend]
            [metabuild-common.core :as u]))

;; TODO -- shouldn't this be `locales.edn`?
(defn- locales-dot-clj []
  {:locales  (conj (i18n/locales) "en")
   :packages ["metabase"]
   :bundle   "metabase.Messages"})

(defn- generate-locales-dot-clj! []
  (u/step "Create resources/locales.clj"
    (let [file (u/filename u/project-root-directory "resources" "locales.clj")]
      (u/delete-file-if-exists! file)
      (spit file (with-out-str (pprint/pprint (locales-dot-clj))))
      (u/assert-file-exists file))))

(defn- create-artifacts-for-locale! [locale]
  (u/step (format "Create artifacts for locale %s" (pr-str locale))
    (frontend/create-artifact-for-locale! locale)
    (backend/create-artifact-for-locale! locale)
    (u/announce "Artifacts for locale %s created successfully." (pr-str locale))))

(defn- create-artifacts-for-all-locales! []
  (doseq [locale (i18n/locales)]
    (create-artifacts-for-locale! locale)))

(defn create-all-artifacts! []
  (u/step "Create i18n artifacts"
    (generate-locales-dot-clj!)
    (create-artifacts-for-all-locales!)
    (u/announce "Translation resources built successfully.")))

(defn -main []
  (create-all-artifacts!))
