(ns leiningen.webpack
  (:require [clojure.java.shell :refer :all]))

;; Set the CI_DISABLE_WEBPACK_MINIFICATION environment variable to skip minification which takes ~6+ minutes on CircleCI
(defn webpack [projects & args]
  ;; TODO - some better validations such as checking that we have webpack available
  (println "Running `webpack -p` to assemble and minify frontend assets")
  (let [result (sh (str (:root projects) "/node_modules/webpack/bin/webpack.js") (if (System/getenv "CI_DISABLE_WEBPACK_MINIFICATION") ""
                                                                                     "-p"))]
    (if (= 0 (:exit result))
      (println (:out result))
      (println (:err result)))))
