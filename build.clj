(require 'cljs.build.api)

(cljs.build.api/build "src"
  {:main 'metabase.client.hello
   :output-to "out/js/main.js"
   :target :nodejs})
