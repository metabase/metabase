(ns metabase.test.util.i18n
  (:require [clojure.test :as t]
            [metabase.util.i18n :as i18n]
            [metabase.util.i18n.impl :as impl]))

(defn map-bundle
  "Convert a Clojure map to a java `ResourceBundle`."
  ^java.util.ListResourceBundle [m]
  (when m
    (let [contents (to-array-2d (seq m))]
      (proxy [java.util.ListResourceBundle] []
        (getContents [] contents)))))

(defn do-with-mock-i18n-bundles [bundles thunk]
  (t/testing (format "\nwith mock i18n bundles %s\n" (pr-str bundles))
    (let [locale->bundle (into {} (for [[locale m] bundles]
                                    [(impl/locale locale) (map-bundle m)]))]
      (with-redefs [impl/bundle* locale->bundle]
        (thunk)))))

(defmacro with-mock-i18n-bundles
  "Mock the i18n resource bundles for the duration of `body`.

    (with-mock-i18n-bundles {\"es\"    {\"Your database has been added!\" \"¡Tu base de datos ha sido añadida!\"}
                               \"es-MX\" {\"I''m good thanks\" \"Está bien, gracias\"}}
      (/translate \"es-MX\" \"Your database has been added!\"))
    ;; -> \"¡Tu base de datos ha sido añadida!\""
  [bundles & body]
  `(do-with-mock-i18n-bundles ~bundles (fn [] ~@body)))

(defmacro with-user-locale
  [user-locale & body]
  `(let [locale# ~user-locale]
     (t/testing (format "\nwith user locale %s" (pr-str locale#))
       (binding [i18n/*user-locale* locale#]
         ~@body))))
