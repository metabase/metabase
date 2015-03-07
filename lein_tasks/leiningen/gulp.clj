(ns leiningen.gulp
  (:use clojure.java.shell))


(defn gulp [projects & args]
  ;; TODO - some better validations such as checking that we have gulp available
  (println "Running `gulp build` to assemble frontend assets into a better format")
  (let [result (sh (str (:root projects) "/node_modules/gulp/bin/gulp.js") "build")]
    (if (= 0 (:exit result))
      (println (:out result))
      (println (:err result)))))