(ns metabase-enterprise.workspaces.models.workspace-transform
  "Model for WorkspaceTransform - holds the changeset of transforms being created
   and edited within a workspace."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

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

(defn generate-ref-id
  "Generate a cute adjective-animal style ref ID with a random suffix.
   Format: adjective-animal-xxxx (where xxxx is a random 4-char hex suffix)"
  []
  (let [adj    (rand-nth adjectives)
        animal (rand-nth animals)
        suffix (format "%04x" (rand-int 65536))]
    (str adj "-" animal "-" suffix)))

;;; -------------------------------------------------- Model Setup --------------------------------------------------

(methodical/defmethod t2/table-name :model/WorkspaceTransform [_model] :workspace_transform)

(methodical/defmethod t2/primary-keys :model/WorkspaceTransform [_model] [:ref_id])

(doto :model/WorkspaceTransform
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/WorkspaceTransform
  {:source mi/transform-json
   :target mi/transform-json})

(t2/define-before-insert :model/WorkspaceTransform
  [instance]
  (cond-> instance
    (not (:ref_id instance)) (assoc :ref_id (generate-ref-id))))
