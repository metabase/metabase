(ns dev.util
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]))

(set! *warn-on-reflection* true)

(defn- os
  "Returns :win, :mac, :unix, or nil"
  []
  (condp
   #(<= 0 (.indexOf ^String %2 ^String %1))
   (.toLowerCase (System/getProperty "os.name"))
   "win" :win
   "mac" :mac
   "nix" :unix
   "nux" :unix
   nil))

;; taken from https://github.com/aysylu/loom/blob/master/src/loom/io.clj
(defn os-open
  "Opens the given file (a string, File, or file URI) in the default
  application for the current desktop environment. Returns nil"
  [f]
  (let [f (io/file f)]
    ;; There's an 'open' method in java.awt.Desktop but it hangs on Windows
    ;; using Clojure Box and turns the process into a GUI process on Max OS X.
    ;; Maybe it's ok for Linux?
    (condp = (os)
      :mac  (sh/sh "open" (str f))
      :win  (sh/sh "cmd" (str "/c start " (-> f .toURI .toURL str)))
      :unix (sh/sh "xdg-open" (str f)))
    nil))
