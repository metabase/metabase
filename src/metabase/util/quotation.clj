(ns metabase.util.quotation)


(def ^:const ^:private quotations
  [{:quote "The world is one big data problem."
    :author "Andrew McAfee"}
   {:quote "Data really powers everything that we do."
    :author "Jeff Weiner"}
   {:quote "I keep saying that the sexy job in the next 10 years will be statisticians, and I'm not kidding."
    :author "Hal Varian"}
   {:quote "Data is the new oil!"
    :author "Clive Humby"}
   {:quote "If we have data, let's look at data.  If all we have are opinions, let's go with mine."
    :author "Jim Barksdale"}
   {:quote "Data that is loved tends to survive."
    :author "Kurt Bollacker"}
   {:quote "Torture the data, and it will confess to anything."
    :author "Ronald Coase"}
   {:quote "The price of light is less than the cost of darkness."
    :author "Arthur C. Nielsen"}
   {:quote "Information is the oil of the 21st century, and analytics is the combustion engine."
    :author "Peter Sondergaard"}
   {:quote "Facts do not cease to exist because they are ignored."
    :author "Aldous Huxley"}
   {:quote "It's easy to lie with statistics.  It's hard to tell the truth without statistics."
    :author "Andrejs Dunkels"}
   {:quote "What gets measured gets managed"
    :author "Peter Drucker"}
   {:quote "Anything that is measured and watched improves."
    :author "Bob Parsons"}])


(defn random-quote
  "Get a randomized quotation about working with data."
  []
  (rand-nth quotations))
