(ns macos-release.upload)

(defn- upload-artifacts! []
  (println "Uploding artifacts to https://downloads.metabase.com...")
  (println "TODO"))

(defn- create-cloudfront-invalidation! []
  (println "Creating cloudfront invalidation...")
  (println "TODO"))

(defn upload! []
  (upload-artifacts!)
  (create-cloudfront-invalidation!))
