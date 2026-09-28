# Java sources

Backend code written in Java, called from Clojure like any other Java class. The sources are in `src/`; they compile
to `classes/`, which is on every classpath.

There is nothing to run by hand: every alias that loads backend code (`:dev`, `:run`, `:doc`, the builds, ...)
compiles first, when a source changed. `clojure -X:javac :force true` recompiles everything. After changing a class a
running REPL has already loaded, restart the REPL. See `tools/mb/javac.clj` for the details.

`clojure -X:javac:javac-lint` holds the sources to more than javac does, with Error Prone and NullAway; CI runs it.
See `mb.javac/lint!`, including for the one place NullAway does not look.
