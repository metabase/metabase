(ns leiningen.webpack
  (:use clojure.java.shell))


(defn webpack [projects & args]
  ;; TODO - some better validations such as checking that we have webpack available
  (println "Running `webpack -p` to assemble and minify frontend assets")
  (let [result (sh (str (:root projects) "/node_modules/webpack/bin/webpack.js") "-p")]
    (if (= 0 (:exit result))
      (println (:out result))
      (println (:err result)))))
