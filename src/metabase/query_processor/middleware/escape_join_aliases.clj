(ns metabase.query-processor.middleware.escape-join-aliases
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.mbql.util :as mbql.u]
            [metabase.util :as u]))

(defn- rename-join-aliases
  "Rename joins in `query` by replacing aliases whose keys appear in `original->new` with their corresponding values."
  [query original->new]
  (let [original->new      (into {} (remove (fn [[original-alias new-alias]] (= original-alias new-alias))
                                            original->new))
        aliases-to-replace (set (keys original->new))]
    (if (empty? original->new)
      query
      (do
        (log/tracef "Rewriting join aliases:\n%s" (u/pprint-to-str original->new))
        (letfn [(rename-join-aliases* [query]
                  (mbql.u/replace query
                    [:field id-or-name (opts :guard (comp aliases-to-replace :join-alias))]
                    [:field id-or-name (update opts :join-alias original->new)]

                    (join :guard (every-pred map? :condition (comp aliases-to-replace :alias)))
                    (merge
                     ;; recursively update stuff inside the join
                     (rename-join-aliases* (dissoc join :alias))
                     {:alias (original->new (:alias join))})))]
          (rename-join-aliases* query))))))

(defn- all-join-aliases [query]
  (into #{} cat (mbql.u/match query
                  (join :guard (every-pred map? :condition :alias))
                  (cons
                   (:alias join)
                   (all-join-aliases (dissoc join :alias))))))

(defn escape-join-aliases
  "Pre-processing middleware. Make sure all join aliases are unique, regardless of case (some databases treat table
  aliases as case-insensitive, even if table names themselves are not); escape all join aliases
  with [[metabase.driver/escape-alias]]."
  [query]
  (let [all-join-aliases (all-join-aliases query)]
    (log/tracef "Join aliases in query: %s" (pr-str all-join-aliases))
    (if (empty? all-join-aliases)
      query
      (let [escape            (fn [join-alias]
                                (driver/escape-alias driver/*driver* join-alias))
            uniquify          (mbql.u/unique-name-generator
                               ;; some databases treat aliases as case-insensitive so make sure the generated aliases
                               ;; are unique regardless of case
                               :name-key-fn     str/lower-case
                               ;; uniqified aliases needs to be escaped again just in case
                               :unique-alias-fn (fn [original suffix]
                                                  (escape (str original \_ suffix))))
            original->escaped (into {}
                                    (map (juxt identity (comp uniquify escape)))
                                    all-join-aliases)]
        (rename-join-aliases query original->escaped)))))
