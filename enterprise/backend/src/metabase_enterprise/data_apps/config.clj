(ns metabase-enterprise.data-apps.config
  "Constants of a data app's manifest, which a serialized app keeps in the `data_app.yaml` in its own directory
   under `data_apps/` (see `README.md` in this directory for the layout); the columns' schemas are in
   [[metabase-enterprise.data-apps.schema]]:

     slug: sales                # the slug the app is served at (column `name`)
     name: Sales dashboard      # display name (column `display_name`)
     description: Pipeline …    # optional — one line on what the app does
     version: 1                 # optional — data app contract version, 1 when absent
     path: dist/index.js        # bundle path, relative to this app's directory (column `bundle_path`)
     allowed_hosts:             # optional — origins the sandboxed bundle may fetch/XHR
       - https://api.example.com
       - https://*.internal.acme.com")

(set! *warn-on-reflection* true)

(def apps-dir
  "Directory at the repo root that holds one subdirectory per data app."
  "data_apps")

(def supported-app-version
  "The data app contract version this Metabase serves. Bumped only on a breaking
   change to the contract, so an app declaring a lower `version` is outdated: it is
   listed only to admins, badged, and never opened."
  1)

(defn outdated?
  "Whether `app` was built for a contract version older than [[supported-app-version]]."
  [{:keys [version]}]
  (< version supported-app-version))
