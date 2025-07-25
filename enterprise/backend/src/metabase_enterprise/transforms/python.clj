(ns metabase-enterprise.transforms.python
  (:import
   (org.graalvm.polyglot Context)))

(defonce context
  (let [path (str (System/getProperty "user.dir") "/venv/bin/python")]
    (.. (Context/newBuilder (into-array String ["python"]))
        (option "python.Executable" path)
        (option "python.ForceImportSite" "true")
        (allowAllAccess true)
        (build))))

(defn execute [python]
  (doto context
    (.eval "python" python)))
