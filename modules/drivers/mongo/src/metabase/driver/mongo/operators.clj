;;;; TODO: remove unnecessary!

(ns metabase.driver.mongo.operators
  "TODO: docstring -- monger leftover
   
   Provides vars that represent various MongoDB operators, for example, $gt or $in or $regex.
   They can be passed in queries as strings but using vars from this namespace makes the code
   a bit cleaner and closer to what you would see in a MongoDB shell query.

   Related documentation guide: http://clojuremongodb.info/articles/querying.html")

(defmacro ^{:private true} defoperator
  [operator]
  `(def ^{:const true} ~(symbol (str operator)) ~(str operator)))

;;
;; QUERY OPERATORS
;;

;; $gt is "greater than" comparator
;; $gte is "greater than or equals" comparator
;; $gt is "less than" comparator
;; $lte is "less than or equals" comparator
;;
;; EXAMPLES:
;;  (monger.collection/find "libraries" { :users { $gt 10 } })
;;  (monger.collection/find "libraries" { :users { $gte 10 } })
;;  (monger.collection/find "libraries" { :users { $lt 10 } })
;;  (monger.collection/find "libraries" { :users { $lte 10 } })
(defoperator $gt)
(defoperator $gte)
(defoperator $lt)
(defoperator $lte)

;; $all matches all values in the array
;;
;; EXAMPLES
;;   (mgcol/find-maps "languages" { :tags { $all [ "functional" "object-oriented" ] } } )
(defoperator $all)

;; The $in operator is analogous to the SQL IN modifier, allowing you to specify an array of possible matches.
;;
;; EXAMPLES
;;   (mgcol/find-maps "languages" { :tags { $in [ "functional" "object-oriented" ] } } )
(defoperator $in)

;; The $nin operator is similar to $in, but it selects objects for which the specified field does not
;; have any value in the specified array.
;;
;; EXAMPLES
;;   (mgcol/find-maps "languages" { :tags { $nin [ "functional" ] } } )
(defoperator $nin)

;; $eq is "equals" comparator
;;
;; EXAMPLES:
;;   (monger.collection/find "libraries" { :language { $eq "Clojure" }})
(defoperator $eq)

;; $ne is "non-equals" comparator
;;
;; EXAMPLES:
;;   (monger.collection/find "libraries" { :language { $ne "Clojure" }})
(defoperator $ne)

;; $elemMatch checks if an element in an array matches the specified expression
;;
;; EXAMPLES:
;;   ;; Matches element with :text "Nice" and :rating greater than or equal 1
;;   (monger.collection/find "comments" { $elemMatch { :text "Nice!" :rating { $gte 1 } } })
(defoperator $elemMatch)

(defoperator $regex)
(defoperator $options)

;; comment on a query predicate
(defoperator $comment)
(defoperator $explain)
(defoperator $hint)
(defoperator $maxTimeMS)
(defoperator $orderBy)
(defoperator $query)
(defoperator $returnKey)
(defoperator $showDiskLoc)
(defoperator $natural)


;;
;; EVALUATION (QUERY)
;;

(defoperator $expr)
(defoperator $jsonSchema)

;; Matches documents that satisfy a JavaScript expression.
;;
;; EXAMPLES:
;;
;;   (monger.collection/find "people" { $where "this.placeOfBirth === this.address.city" })
(defoperator $where)

;;
;; LOGIC OPERATORS
;;

;; $and lets you use a boolean and in the query. Logical and means that all the given expressions should be true for positive match.
;;
;; EXAMPLES:
;;
;;   ;; Matches all libraries where :language is "Clojure" and :users is greater than 10
;;   (monger.collection/find "libraries" { $and [{ :language "Clojure" } { :users { $gt 10 } }] })
(defoperator $and)

;; $or lets you use a boolean or in the query. Logical or means that one of the given expressions should be true for positive match.
;;
;; EXAMPLES:
;;
;;   ;; Matches all libraries whose :name is "mongoid" or :language is "Ruby"
;;   (monger.collection.find "libraries" { $or [ { :name "mongoid" } { :language "Ruby" } ] })
(defoperator $or)

;; @nor lets you use a boolean expression, opposite to "all" in the query (think: neither). Give $nor a list of expressions, all of which should
;;   be false for positive match.
;;
;; EXAMPLES:
;;
;;   (monger.collection/find "libraries" { $nor [{ :language "Clojure" } {:users { $gt 10 } } ]})
(defoperator $nor)

;;
;; ATOMIC MODIFIERS
;;

;; $inc increments one or many fields for the given value, otherwise sets the field to value
;;
;; EXAMPLES:
;;  (monger.collection/update "scores" { :_id user-id } { :score 10 } })
;;  (monger.collection/update "scores" { :_id user-id } { :score 20 :bonus 10 } })
(defoperator $inc)

(defoperator $mul)

;; $set sets an existing (or non-existing) field (or set of fields) to value
;; $set supports all datatypes.
;;
;; EXAMPLES:
;;   (monger.collection/update "things" { :_id oid } { $set { :weight 20.5 } })
;;   (monger.collection/update "things" { :_id oid } { $set { :weight 20.5 :height 12.5 } })
(defoperator $set)

;; $unset deletes a given field, non-existing fields are ignored.
;;
;; EXAMPLES:
;;   (monger.collection/update "things" { :_id oid } { $unset { :weight 1 } })
(defoperator $unset)

;; $setOnInsert assigns values to fields during an upsert only when using the upsert option to the update operation performs an insert.
;; New in version 2.4. http://docs.mongodb.org/manual/reference/operator/setOnInsert/
;;
;; EXAMPLES:
;;   (monger.collection/find-and-modify "things" {:_id oid} {$set {:lastseen now} $setOnInsert {:firstseen now}} :upsert true)
(defoperator $setOnInsert)

;; $rename renames a given field
;;
;; EXAMPLES:
;;   (monger.collection/update "things" { :_id oid } { $rename { :old_field_name "new_field_name" } })
(defoperator $rename)

;; $push appends _single_ value to field, if field is an existing array, otherwise sets field to the array [value] if field is not present.
;; If field is present but is not an array, an error condition is raised.
;;
;; EXAMPLES:
;;   (mgcol/update "docs" { :_id oid } { $push { :tags "modifiers" } })
(defoperator $push)

;; $position modifies the behavior of $push per https://docs.mongodb.com/manual/reference/operator/update/position/
(defoperator $position)

;; $each is a modifier for the $push and $addToSet operators for appending multiple values to an array field.
;; Without the $each modifier $push and $addToSet will append an array as a single value.
;; MongoDB 2.4 adds support for the $each modifier to the $push operator.
;; In MongoDB 2.2 the $each modifier can only be used with the $addToSet operator.
;;
;; EXAMPLES:
;;   (mgcol/update coll { :_id oid } { $push { :tags { $each ["mongodb" "docs"] } } })
(defoperator $each)

;; $addToSet Adds value to the array only if its not in the array already, if field is an existing array, otherwise sets field to the
;; array value if field is not present. If field is present but is not an array, an error condition is raised.
;;
;; EXAMPLES:
;;   (mgcol/update coll { :_id oid } { $addToSet { :tags "modifiers" } })
(defoperator $addToSet)

;; $pop removes the last element in an array, if 1 is passed.
;; if -1 is passed, removes the first element in an array
;;
;; EXAMPLES:
;;   (mgcol/update coll { :_id oid } { $pop { :tags 1 } })
;;   (mgcol/update coll { :_id oid } { $pop { :tags 1 :categories 1 } })
(defoperator $pop)

;; $pull removes all occurrences of value from field, if field is an array. If field is present but is not an array, an error condition
;; is raised.
;;
;; EXAMPLES:
;;   (mgcol/update coll { :_id oid } { $pull { :measurements 1.2 } })
(defoperator $pull)

;; $pullAll removes all occurrences of each value in value_array from field, if field is an array. If field is present but is not an array
;; an error condition is raised.
;;
;; EXAMPLES:
;;   (mgcol/update coll { :_id oid } { $pullAll { :measurements 1.2 } })
;;   (mgcol/update coll { :_id oid } { $pullAll { :measurements { $gte 1.2 } } })
(defoperator $pullAll)

(defoperator $bit)
(defoperator $bitsAllClear)
(defoperator $bitsAllSet)
(defoperator $bitsAnyClear)
(defoperator $bitsAnySet)

(defoperator $exists)
(defoperator $mod)
(defoperator $size)
(defoperator $type)
(defoperator $not)


;;
;; Aggregation in 4.2
;;

(defoperator $addFields)
(defoperator $bucket)
(defoperator $bucketAuto)
(defoperator $collStats)
(defoperator $facet)
(defoperator $geoNear)
(defoperator $graphLookup)
(defoperator $indexStats)
(defoperator $listSessions)
(defoperator $lookup)
(defoperator $match)
(defoperator $merge)
(defoperator $out)
(defoperator $planCacheStats)
(defoperator $project)
(defoperator $redact)
(defoperator $replaceRoot)
(defoperator $replaceWith)
(defoperator $sample)
(defoperator $limit)
(defoperator $skip)
(defoperator $unwind)
(defoperator $group)
(defoperator $sort)
(defoperator $sortByCount)

(defoperator $currentOp)
(defoperator $listLocalSessions)

(defoperator $cmp)

(defoperator $min)
(defoperator $max)
(defoperator $avg)
(defoperator $stdDevPop)
(defoperator $stdDevSamp)
(defoperator $sum)
(defoperator $let)

(defoperator $first)
(defoperator $last)

(defoperator $abs)
(defoperator $add)
(defoperator $ceil)
(defoperator $divide)
(defoperator $exp)
(defoperator $floor)
(defoperator $ln)
(defoperator $log)
(defoperator $log10)
(defoperator $multiply)
(defoperator $pow)
(defoperator $round)
(defoperator $sqrt)
(defoperator $subtract)
(defoperator $trunc)
(defoperator $literal)

(defoperator $arrayElemAt)
(defoperator $arrayToObject)
(defoperator $concatArrays)
(defoperator $filter)
(defoperator $indexOfArray)
(defoperator $isArray)
(defoperator $map)
(defoperator $objectToArray)
(defoperator $range)
(defoperator $reduce)
(defoperator $reverseArray)
(defoperator $zip)
(defoperator $mergeObjects)

(defoperator $allElementsTrue)
(defoperator $anyElementsTrue)
(defoperator $setDifference)
(defoperator $setEquals)
(defoperator $setIntersection)
(defoperator $setIsSubset)
(defoperator $setUnion)

(defoperator $strcasecmp)
(defoperator $substr)
(defoperator $substrBytes)
(defoperator $substrCP)
(defoperator $toLower)
(defoperator $toString)
(defoperator $toUpper)
(defoperator $concat)
(defoperator $indexOfBytes)
(defoperator $indexOfCP)
(defoperator $ltrim)
(defoperator $regexFind)
(defoperator $regexFindAll)
(defoperator $regexMatch)
(defoperator $rtrim)
(defoperator $split)
(defoperator $strLenBytes)
(defoperator $subLenCP)
(defoperator $trim)

(defoperator $sin)
(defoperator $cos)
(defoperator $tan)
(defoperator $asin)
(defoperator $acos)
(defoperator $atan)
(defoperator $atan2)
(defoperator $asinh)
(defoperator $acosh)
(defoperator $atanh)
(defoperator $radiansToDegrees)
(defoperator $degreesToRadians)

(defoperator $convert)
(defoperator $toBool)
(defoperator $toDecimal)
(defoperator $toDouble)
(defoperator $toInt)
(defoperator $toLong)
(defoperator $toObjectId)

(defoperator $dayOfMonth)
(defoperator $dayOfWeek)
(defoperator $dayOfYear)
(defoperator $hour)
(defoperator $minute)
(defoperator $month)
(defoperator $second)
(defoperator $millisecond)
(defoperator $week)
(defoperator $year)
(defoperator $isoDate)
(defoperator $dateFromParts)
(defoperator $dateFromString)
(defoperator $dateToParts)
(defoperator $dateToString)
(defoperator $isoDayOfWeek)
(defoperator $isoWeek)
(defoperator $isoWeekYear)
(defoperator $toDate)


(defoperator $ifNull)
(defoperator $cond)
(defoperator $switch)

;; Geospatial
(defoperator $geoWithin)
(defoperator $geoIntersects)
(defoperator $near)
(defoperator $nearSphere)
(defoperator $geometry)
(defoperator $maxDistance)
(defoperator $minDistance)
(defoperator $center)
(defoperator $centerSphere)
(defoperator $box)
(defoperator $polygon)

(defoperator $slice)

;; full text search
(defoperator $text)
(defoperator $meta)
(defoperator $search)
(defoperator $language)
(defoperator $natural)

;; $currentDate operator sets the value of a field to the current date, either as a Date or a timestamp. The default type is Date.
;;
;; EXAMPLES:
;;   (mgcol/update coll { :_id oid } { $currentDate { :lastModified true } })
(defoperator $currentDate)

;; Isolates intermediate multi-document updates from other clients.
;;
;; EXAMPLES:
;;   (mgcol/update "libraries" { :language "Clojure", $isolated 1 } { $inc { :popularity 1 } } {:multi true})
(defoperator $isolated)

(defoperator $count)