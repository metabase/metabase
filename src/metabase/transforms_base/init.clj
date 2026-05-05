(ns metabase.transforms-base.init
  "Loads multimethod implementations for the transforms-base module.

   `:query` implementations are loaded here directly.
   `:python` implementations are loaded via the enterprise init chain
   (metabase-enterprise.transforms-python.init)."
  (:require
   [metabase.transforms-base.ordering]
   [metabase.transforms-base.query]))
