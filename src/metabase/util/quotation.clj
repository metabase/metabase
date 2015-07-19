(ns metabase.util.quotation)


(def ^:const quotations
  [{:quote "The world is one big data problem."
    :author "Andrew McAfee"}
   {:quote "Data really powers everythign that we do."
    :author "Jeff Weiner"}
   {:quote "I keep saying that the sexy job in the next 10 years will be statisticians, and I'm not kidding."
    :author "Hal Varian"}])


(defn random-quote
  "Get a randomized quotation about working with data."
  []
  (rand-nth quotations))
