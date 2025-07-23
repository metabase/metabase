(ns metabase-enterprise.content-translation.utils)

(defmacro with-clean-translations!
  "Macro to reset the content translation table to an empty state before a test and restore it after the test runs."
  [& body]
  `(let [original-entities# (t2/select [:model/ContentTranslation])]
     (try
       (t2/delete! :model/ContentTranslation)
       ~@body
       (finally
         (t2/delete! :model/ContentTranslation)
         (when (seq original-entities#)
           (t2/insert! :model/ContentTranslation original-entities#))))))
