(ns metabase.flarg.test-flarg.init
  "Loads the test-flarg's source so its `defflarg` impls register. Phase 1.6 will wire up a startup
  hook that requires this ns; for now it just establishes the convention that every flarg has an
  `init` ns responsible for triggering registration."
  (:require
   [metabase.flarg.test-flarg.core]))
