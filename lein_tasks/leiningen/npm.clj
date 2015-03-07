(ns leiningen.npm
  (:use clojure.java.shell))


(defn npm [projects & args]
  ;; TODO - some better validations such as checking if `npm` is available
  (println "Running `npm install` to download javascript dependencies")
  (let [result (sh "npm" "install")]
    (if (= 0 (:exit result))
      (println (:out result))
      (println (:err result)))))