(ns metabase.config.jekyll
  "Jekyll mode: a stripped child-instance boot that holds nothing precious — no
  scheduler, no sample/audit DB, no notification seeding. Precious state lives in
  git; the box authors transforms, previews them, and reloads from its branch on
  boot. Every cut is gated on [[jekyll?]] and is a no-op when off.

  Gated on the `MB_JEKYLL_MODE` env var rather than the `workspace-mode?` /
  `instance-workspace` child signal: that signal is populated from the config.yml
  `:workspace` section at `metabase.core.core/init!*` *after* the scheduler cut,
  so it is not readable at the earliest cut point. An env flag is the only
  boot-safe primitive (env resolves before app-db and before config-from-file)."
  (:require
   [environ.core :as env]))

(set! *warn-on-reflection* true)

(defn jekyll?
  "True when Jekyll mode is active (`MB_JEKYLL_MODE=true`)."
  []
  (boolean (some-> (env/env :mb-jekyll-mode) Boolean/parseBoolean)))
