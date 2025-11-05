(ns metabase.testing-api.settings
  (:require
   [metabase.config.core :as config]))

(def enable-testing-routes?
  "Whether to enable `/api/testing` endpoints (utils for e2e Cypress tests).

  This is a plain var rather than a `defsetting` so we can evaluate it at launch before the app DB is set up. As a
  result, its value cannot be changed at runtime."
  (or (not config/is-prod?)
      (config/config-bool :mb-enable-test-endpoints)))
