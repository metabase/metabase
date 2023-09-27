(ns metabase.test.util.i18n
  (:require
   [clojure.test :as t]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.util.i18n :as i18n]
   [metabase.util.i18n.impl :as i18n.impl]))

(defn do-with-mock-i18n-bundles [bundles thunk]
  (t/testing (format "\nwith mock i18n bundles %s\n" (pr-str bundles))
    (let [locale->bundle (update-keys bundles i18n/locale)
          translations   (comp locale->bundle i18n/locale)]
      (if tu.thread-local/*thread-local*
        (binding [i18n.impl/*translations* translations]
          (thunk))
        (with-redefs [i18n.impl/*translations* translations]
          (thunk))))))

(defmacro with-mock-i18n-bundles
  "Mock the i18n resource bundles for the duration of `body`.

    (with-mock-i18n-bundles {\"es\"    {:messages {\"Your database has been added!\"
                                                   [\"¡Tu base de datos ha sido añadida!\"]}}
                             \"es-MX\" {:messages {\"I''m good thanks\"
                                                   [\"Está bien, gracias\"]}}}
      (translate \"es-MX\" \"Your database has been added!\"))
    ;; -> \"¡Tu base de datos ha sido añadida!\"

  Thread-safe by default; inside [[metabase.test/test-helpers-set-global-values!]], sets values globally."
  [bundles & body]
  `(do-with-mock-i18n-bundles ~bundles (^:once fn* [] ~@body)))

(defmacro with-user-locale
  [user-locale & body]
  `(let [locale# ~user-locale]
     (t/testing (format "\nwith user locale %s" (pr-str locale#))
       (binding [i18n/*user-locale* locale#]
         ~@body))))
