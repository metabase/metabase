(ns metabase.require)

(gen-class
 :name metabase.require
 :prefix nil
 :methods [#^{:static true} [api [] void]])

(defn- require-all [forms]
  (dorun (map require forms)))

(def api-requires
  ^:private
  '[[compojure.core :refer [GET POST PUT DELETE defroutes context]]
    [korma.core :refer :all]
    [metabase.api.common :refer :all]
    [metabase.db :refer :all]
    (metabase.models [hydrate :refer [hydrate simple-batched-hydrate]]
                     [card :refer [Card]]
                     [card-favorite :refer [CardFavorite]]
                     [field :refer [Field]]
                     [database :refer [Database]]
                     [dashboard :refer [Dashboard]]
                     [org :refer [Org]]
                     [table :refer [Table]]
                     [user :refer [User]])])

(defn api [] (require-all api-requires))
