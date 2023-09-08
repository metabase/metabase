(ns metabase.test.util.i18n
  (:require
   [clojure.test :as t]
   [metabase.util.i18n :as i18n]
   [metabase.util.i18n.impl :as i18n.impl]
   [metabase.util.malli :as mu]))

(mu/defn do-with-mock-i18n-bundles
  [bundles :- [:map-of
               [:or
                [:string {:min 2, :max 2}]  ; e.g. en
                [:string {:min 5, :max 5}]] ; e.g. en-US
               [:map
                [:messages [:map-of :string :string]]
                [:headers {:optional true} [:map
                                            ["Plural-Forms" {:optional true} :string]]]]]
   thunk   :- [:=> [:cat] :any]]
  (t/testing (format "\nwith mock i18n bundles %s\n" (pr-str bundles))
    (let [locale->bundle (into {} (for [[locale-name bundle] bundles]
                                    [(i18n/locale locale-name) bundle]))]
      (binding [i18n.impl/*translations* (comp locale->bundle i18n/locale)]
        (thunk)))))

(defmacro with-mock-i18n-bundles
  "Mock the i18n resource bundles for the duration of `body`.

    (with-mock-i18n-bundles {\"es\"    {:messages {\"Your database has been added!\"
                                                   [\"¡Tu base de datos ha sido añadida!\"]}}
                             \"es-MX\" {:messages {\"I''m good thanks\"
                                                   [\"Está bien, gracias\"]}}}
      (translate \"es-MX\" \"Your database has been added!\"))
    ;; -> \"¡Tu base de datos ha sido añadida!\""
  [bundles & body]
  `(do-with-mock-i18n-bundles ~bundles (fn [] ~@body)))

(defmacro with-user-locale
  [user-locale & body]
  `(let [locale# ~user-locale]
     (t/testing (format "\nwith user locale %s" (pr-str locale#))
       (binding [i18n/*user-locale* locale#]
         ~@body))))
