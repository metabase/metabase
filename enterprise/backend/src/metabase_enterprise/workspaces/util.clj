(ns metabase-enterprise.workspaces.util
  (:require
   [clojure.string :as str]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn assert-transform!
  "Test whether we support the given entity type within workspaces yet.
   Named for the only case we support currently, to make call sites assumptions more obvious."
  [entity-type]
  (when (not= "transform" (name entity-type))
    (throw (ex-info "Only transform entity type is supported"
                    {:status-code 400
                     :entity-type entity-type}))))

(defn assert-transforms!
  "Test that only supported types are given in the given list.
   Named for the only case we support currently, to make call sites assumptions more obvious."
  [entities]
  (when-let [other-types (seq (remove #{:transform} (map :entity-type entities)))]
    (throw (ex-info "Only transform entities are currently supported"
                    {:status-code       400
                     :unsupported-types other-types}))))

(defn- toposort-visit [node child->parents visited result]
  (cond
    (visited node) [visited result]
    :else (let [parents (child->parents node [])
                [visited' result'] (reduce (fn [[v r] p]
                                             (toposort-visit p child->parents v r))
                                           [(conj visited node) result]
                                           parents)]
            [visited' (conj result' node)])))

(defn toposort-dfs
  "Perform a topological sort using depth-first search.
   Takes a map from child nodes to their parent nodes (dependencies).
   Returns nodes in topological order (dependencies before dependents)."
  [child->parents]
  ;; TODO (Chris 2025-11-20) -- Detect cycles and throw an error.
  (let [all-nodes (set (keys child->parents))]
    (loop [visited   #{}
           result    []
           remaining all-nodes]
      (if (empty? remaining)
        result
        (let [node (first remaining)
              [visited' result'] (toposort-visit node child->parents visited result)]
          (recur visited' result' (disj remaining node)))))))

;;; Naming

;; reusing https://github.com/metabase/metabase/pull/61887/commits/c92e4a9cc451c61a13fef19ed9d6107873b17f07
;; (original ws isolation code)
(defn- instance-uuid-slug
  "Create a slug from the site UUID, taking the first character of each section."
  [site-uuid-string]
  (->> (str/split site-uuid-string #"-")
       (map first)
       (apply str)))

;; WARNING: Changing this prefix requires backwards compatibility handling for existing workspaces.
;; The prefix is used to identify isolation namespaces in the database, and existing workspaces
;; will have namespaces created with the current prefix.
(def ^:private isolated-prefix "mb__isolation")

(defn isolation-namespace-name
  "Generate namespace/database name for workspace isolation following mb__isolation_<slug>_<workspace-id> pattern.
  Uses 'namespace' as the generic term that maps to 'schema' in Postgres, 'database' in ClickHouse, etc."
  [workspace]
  (assert (some? (:id workspace)) "Workspace must have an :id")
  (let [instance-slug      (instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str (:id workspace)) #"[^a-zA-Z0-9]" "_")]
    (format "%s_%s_%s" isolated-prefix instance-slug clean-workspace-id)))

(defn isolated-table-name
  "Generate name for a table mirroring transform target table in the isolated database namespace.
   Returns schema__name when schema is present, or __name when schema is nil (to distinguish from global tables)."
  [schema name]
  ;; In perverse cases, this might not be unique.
  ;; Since we persist the mappings in the appdb associated with each transform output, we *could* detect conflicts and
  ;; restore uniqueness. Given the low risk, we chose to do nothing for now.
  (if schema
    (format "%s__%s" schema name)
    (format "__%s" name)))

(defn isolation-user-name
  "Generate username for workspace isolation."
  [workspace]
  (let [instance-slug (instance-uuid-slug (str (system/site-uuid)))]
    (format "%s_%s_%s" isolated-prefix instance-slug (:id workspace))))

(def ^:private password-char-sets
  "Character sets for password generation. Cycles through these to ensure representation from each."
  ["ABCDEFGHJKLMNPQRSTUVWXYZ"
   "abcdefghjkmnpqrstuvwxyz"
   "123456789"
   "!#$%&*+-="])

(defn random-isolated-password
  "Generate a random password suitable for most database engines.
   Ensures the password contains characters from all sets (uppercase, lowercase, digits, special)
   by cycling through the character sets. Result is shuffled for randomness."
  []
  (->> (cycle password-char-sets)
       (take (+ 32 (rand-int 32)))
       (map rand-nth)
       shuffle
       (apply str)))

;;; -------------------------------------------------- Cute Names --------------------------------------------------

(def ^:private adjectives
  "Adjectives for generating cute ref IDs, inspired by Docker's naming scheme."
  ["admiring" "adoring" "affectionate" "agitated" "amazing" "angry" "awesome"
   "beautiful" "blissful" "bold" "boring" "brave" "busy" "charming" "clever"
   "cool" "compassionate" "competent" "condescending" "confident" "cranky"
   "crazy" "dazzling" "determined" "distracted" "dreamy" "eager" "ecstatic"
   "elastic" "elated" "elegant" "eloquent" "epic" "exciting" "fervent"
   "festive" "flamboyant" "focused" "friendly" "frosty" "funny" "gallant"
   "gifted" "goofy" "gracious" "great" "happy" "hardcore" "heuristic" "hopeful"
   "hungry" "infallible" "inspiring" "intelligent" "interesting" "jolly"
   "jovial" "keen" "kind" "laughing" "loving" "lucid" "magical" "modest"
   "musing" "mystifying" "naughty" "nervous" "nice" "nifty" "nostalgic"
   "objective" "optimistic" "peaceful" "pedantic" "pensive" "practical"
   "priceless" "quirky" "quizzical" "recursing" "relaxed" "reverent" "romantic"
   "sad" "serene" "sharp" "silly" "sleepy" "stoic" "strange" "stupefied"
   "suspicious" "sweet" "tender" "thirsty" "trusting" "unruffled" "upbeat"
   "vibrant" "vigilant" "vigorous" "wizardly" "wonderful" "xenodochial" "youthful"
   "zealous" "zen"])

(def ^:private animals
  "Animals for generating cute ref IDs."
  ["albatross" "alligator" "alpaca" "ant" "anteater" "antelope" "armadillo"
   "baboon" "badger" "bat" "bear" "beaver" "bee" "bison" "boar" "buffalo"
   "butterfly" "camel" "capybara" "caribou" "cat" "caterpillar" "cheetah"
   "chicken" "chimpanzee" "chinchilla" "cobra" "condor" "cormorant" "coyote"
   "crab" "crane" "crocodile" "crow" "deer" "dingo" "dog" "dolphin" "donkey"
   "dove" "dragonfly" "duck" "eagle" "echidna" "eel" "elephant" "elk" "emu"
   "falcon" "ferret" "finch" "firefly" "flamingo" "fox" "frog" "gazelle"
   "gerbil" "giraffe" "goat" "goose" "gopher" "gorilla" "grasshopper" "grouse"
   "hamster" "hare" "hawk" "hedgehog" "heron" "hippopotamus" "hornet" "horse"
   "hummingbird" "hyena" "ibex" "iguana" "impala" "jackal" "jaguar" "jellyfish"
   "kangaroo" "kingfisher" "kiwi" "koala" "komodo" "kookaburra" "lemur"
   "leopard" "lion" "lizard" "llama" "lobster" "lynx" "magpie" "mallard"
   "manatee" "mandrill" "marmot" "meerkat" "mink" "mole" "mongoose" "monkey"
   "moose" "moth" "mouse" "mule" "narwhal" "newt" "nightingale" "ocelot"
   "octopus" "okapi" "opossum" "orangutan" "orca" "oryx" "osprey" "ostrich"
   "otter" "owl" "ox" "panda" "panther" "parrot" "partridge" "peacock"
   "pelican" "penguin" "pheasant" "pig" "pigeon" "platypus" "pony" "porcupine"
   "porpoise" "puma" "quail" "rabbit" "raccoon" "ram" "raven" "reindeer"
   "rhinoceros" "salamander" "salmon" "sardine" "scorpion" "seahorse" "seal"
   "shark" "sheep" "shrew" "skunk" "sloth" "snail" "snake" "sparrow" "spider"
   "squid" "squirrel" "starfish" "stingray" "stork" "swallow" "swan" "tapir"
   "tiger" "toad" "toucan" "turkey" "turtle" "viper" "vulture" "wallaby"
   "walrus" "warthog" "wasp" "weasel" "whale" "wolf" "wolverine" "wombat"
   "woodpecker" "yak" "zebra"])

(defn generate-name
  "Generate a cute adjective-animal style name. Making sure it's unique is your job."
  []
  (str (rand-nth adjectives) "-" (rand-nth animals)))

(defn generate-ref-id
  "Generate a cute adjective-animal style ref ID with a random suffix.
   Format: adjective-animal-xxxx (where xxxx is a random 4-char hex suffix)"
  []
  (str (generate-name) "-" (format "%04x" (rand-int 65536))))

;;; -------------------------------- Epochal Versioning Helpers ------------------------------------------

(defmacro ignore-constraint-violation
  "Execute body and silently return nil if a unique constraint violation occurs.
   Used in epochal versioning where concurrent processes may race to insert the same version.
   If the exception is not a constraint violation, it is rethrown."
  [& body]
  `(try
     ~@body
     (catch Exception e#
       ;; Check if this is a constraint violation (database-specific messages)
       ;; H2:         "Unique index or primary key violation"
       ;; PostgreSQL: "duplicate key value violates unique constraint"
       ;; MySQL:      "Duplicate entry"
       (let [msg#       (or (ex-message e#) "")
             cause-msg# (or (some-> e# ex-cause ex-message) "")]
         (if (or (re-find #"(?i)unique|duplicate|constraint" msg#)
                 (re-find #"(?i)unique|duplicate|constraint" cause-msg#))
           ;; It's good to keep these visible, as they should be rare and can cause transient consistency issues.
           (log/info "Ignoring constraint violation (concurrent insert race):" msg#)
           (throw e#))))))

;;; -------------------------------- Toucan2 MySQL Workarounds ------------------------------------------

(defn insert-returning-ws-tx!
  "Insert a WorkspaceTransform and return the inserted instance.

   Works around a Toucan2 limitation where `t2/insert-returning-instance!` returns nil
   for tables with composite primary keys on MySQL and H2. These databases don't reliably
   support RETURNING for composite PKs, so we fall back to select after insert.

   See: https://github.com/camsaul/toucan2/issues/204"
  [row]
  (or (t2/insert-returning-instance! :model/WorkspaceTransform row)
      (t2/select-one :model/WorkspaceTransform :workspace_id (:workspace_id row), :ref_id (:ref_id row))))
