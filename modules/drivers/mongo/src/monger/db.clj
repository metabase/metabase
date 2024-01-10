;; This source code is dual-licensed under the Apache License, version
;; 2.0, and the Eclipse Public License, version 1.0.
;;
;; The APL v2.0:
;;
;; ----------------------------------------------------------------------------------
;; Copyright (c) 2011-2018 Michael S. Klishin, Alex Petrov, and the ClojureWerkz Team
;; Copyright (c) 2012 Toby Hede
;;
;; Licensed under the Apache License, Version 2.0 (the "License");
;; you may not use this file except in compliance with the License.
;; You may obtain a copy of the License at
;;
;;     http://www.apache.org/licenses/LICENSE-2.0
;;
;; Unless required by applicable law or agreed to in writing, software
;; distributed under the License is distributed on an "AS IS" BASIS,
;; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
;; See the License for the specific language governing permissions and
;; limitations under the License.
;; ----------------------------------------------------------------------------------
;;
;; The EPL v1.0:
;;
;; ----------------------------------------------------------------------------------
;; Copyright (c) 2011-2018 Michael S. Klishin, Alex Petrov, and the ClojureWerkz Team.
;; Copyright (c) 2012 Toby Hede
;; All rights reserved.
;;
;; This program and the accompanying materials are made available under the terms of
;; the Eclipse Public License Version 1.0,
;; which accompanies this distribution and is available at
;; http://www.eclipse.org/legal/epl-v10.html.
;; ----------------------------------------------------------------------------------

(ns monger.db
  "Functions that provide operations on databases"
  (:refer-clojure :exclude [find remove count drop distinct empty?])
  (:import [com.mongodb #_Mongo DB DBCollection])
  (:require monger.core
            [monger.conversion :refer :all]))


;;
;; API
;;

(defn add-user
  "Adds a new user for this db"
  [^DB db ^String username ^chars password]
  (.addUser db username password))


(defn drop-db
  "Drops the currently set database (via core/set-db) or the specified database."
  [^DB db]
  (.dropDatabase db))

(defn get-collection-names
  "Returns a set containing the names of all collections in this database."
  ([^DB db]
     (set (.getCollectionNames db))))
