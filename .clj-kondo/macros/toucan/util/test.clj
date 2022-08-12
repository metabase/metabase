(ns macros.toucan.util.test)

(defmacro with-temp
  "Create a temporary instance of ENTITY bound to BINDING-FORM, execute BODY,
   then deletes it via `delete!`.

   Our unit tests rely a heavily on the test data and make some assumptions about the
   DB staying in the same *clean* state. This allows us to write very concise tests.
   Generally this means tests should \"clean up after themselves\" and leave things the
   way they found them.

   `with-temp` should be preferrable going forward over creating random objects *without*
   deleting them afterward.

    (with-temp EmailReport [report {:creator_id (user->id :rasta)
                                    :name       (random-name)}]
      ...)"
  [model [binding-form & [options-map]] & body]
  `(toucan.util.test/do-with-temp ~model ~options-map (fn [~binding-form]
                                                        ~@body)))

(defmacro with-temp*
  "Like `with-temp` but establishes multiple temporary objects at the same time.

     (with-temp* [Database [{database-id :id}]
                  Table    [table {:db_id database-id}]]
       ...)"
  [model-bindings & body]
  (loop [[pair & more] (reverse (partition 2 model-bindings)), body `(do ~@body)]
    (let [body `(toucan.util.test/with-temp ~@pair
                  ~body)]
      (if (seq more)
        (recur more body)
        body))))
