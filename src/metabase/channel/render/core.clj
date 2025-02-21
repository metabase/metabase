(ns metabase.channel.render.core
  (:require
   [metabase.channel.render.card :as render.card]
   [metabase.channel.render.image-bundle :as image-bundle]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.channel.render.preview :as render.preview]
   [metabase.channel.render.style :as style]
   [potemkin :as p]))

(p/import-vars
 [image-bundle
  image-bundle->attachment
  make-image-bundle]
 [style
  color-text-light
  color-text-medium
  color-text-dark
  primary-color
  section-style
  style]
 [render.preview
  render-dashboard-to-html
  style-tag-from-inline-styles
  style-tag-nonce-middleware]
 [render.card
  detect-pulse-chart-type
  defaulted-timezone
  render-pulse-card
  render-pulse-card-for-display
  render-pulse-section
  render-pulse-card-to-png
  render-pulse-card-to-base64
  png-from-render-info]
 [js.svg
  icon])
