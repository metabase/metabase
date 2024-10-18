(ns metabase.pulse.core
  "API namespace for the `metabase.pulse` module."
  (:require
   [metabase.pulse.parameters]
   [metabase.pulse.preview]
   [metabase.pulse.render]
   [metabase.pulse.render.image-bundle]
   [metabase.pulse.render.js-svg]
   [metabase.pulse.render.style]
   [metabase.pulse.send]
   [potemkin :as p]))

(comment
  metabase.pulse.send/keep-me
  metabase.pulse.parameters/keep-me
  metabase.pulse.preview/keep-me
  metabase.pulse.render/keep-me
  metabase.pulse.render.image-bundle/keep-me
  metabase.pulse.render.js-svg/keep-me
  metabase.pulse.render.style/keep-me)

(p/import-vars
 [metabase.pulse.parameters
  dashboard-url
  parameters
  process-virtual-dashcard
  value-string]
 [metabase.pulse.preview
  render-dashboard-to-html
  style-tag-from-inline-styles
  style-tag-nonce-middleware]
 [metabase.pulse.render
  detect-pulse-chart-type
  png-from-render-info
  render-pulse-card
  render-pulse-card-for-display
  render-pulse-card-to-base64
  render-pulse-card-to-png
  render-pulse-section]
 [metabase.pulse.render.image-bundle
  image-bundle->attachment
  make-image-bundle]
 [metabase.pulse.render.js-svg
  icon]
  ;; TODO -- this stuff is also used by emails, it probably should belong in some sort of common place
 [metabase.pulse.render.style
  color-text-light
  color-text-medium
  color-text-dark
  primary-color
  section-style
  style]
 [metabase.pulse.send
  defaulted-timezone
  send-pulse!])
