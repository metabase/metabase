(ns metabase.appearance.core
  (:require
   [metabase.appearance.settings]
   [potemkin :as p]))

(comment metabase.appearance.settings/keep-me)

(p/import-vars
 [metabase.appearance.settings
  application-color
  application-colors
  application-favicon-url
  application-font
  application-font-files
  application-logo-url
  application-name
  custom-formatting
  custom-homepage
  custom-homepage-dashboard
  example-dashboard-id
  help-link
  help-link-custom-destination
  landing-page
  landing-page-illustration
  landing-page-illustration-custom
  loading-message
  login-page-illustration
  login-page-illustration-custom
  no-data-illustration
  no-data-illustration-custom
  no-object-illustration
  no-object-illustration-custom
  secondary-chart-color
  show-homepage-data
  show-homepage-pin-message
  show-metabase-links
  show-metabot
  site-name
  site-name!])
