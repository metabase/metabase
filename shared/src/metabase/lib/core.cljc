(ns metabase.lib.core)

(def ^:private emoji "🥰" #_"😍")

(defn add-emoji [s]
  (str s " " emoji))

(defn hello-world [user-name]
  (add-emoji (str "Hello, " user-name "!")))
