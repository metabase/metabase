(ns dev.java
  "Compiles the backend's Java sources on load, when they changed; see `mb.javac`. `user` requires this ahead of every
  `metabase.*` namespace, since those may import the compiled classes."
  (:require
   [mb.javac :as javac]))

(javac/compile!)
