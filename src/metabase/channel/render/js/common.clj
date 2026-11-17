(ns metabase.channel.render.js.common
  "Shared helpers for pooled static-viz renderers (see [[metabase.channel.render.js.graal]]): the graal
  bundle's classpath path and the test-init guard."
  (:require
   [metabase.config.core :as config]))

(set! *warn-on-reflection* true)

(def bundle-resource-path
  "Classpath path of the built static-viz bundle the graal renderer evaluates in-process."
  "frontend_client/app/dist/lib-static-viz.bundle.js")

(defn assert-tests-not-initializing!
  "Guard against loading the static-viz bundle as a side effect of loading namespaces: it might not have
  been built yet. If it hasn't, we want a meaningful error (see the fixture in
  [[metabase.channel.render.js.svg-test]]) rather than a meaningless failure at test-runner startup."
  []
  (when config/tests-available?
    ((requiring-resolve 'mb.hawk.init/assert-tests-are-not-initializing) "(mt/id ...) or (data/id ...)")))
