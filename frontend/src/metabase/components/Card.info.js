import React from "react"
import Card from "metabase/components/Card"

export const component = Card

export const description = `
Use cards to help differentiate content blocks or form easily distinguishable
items in a list. They have no default padding but accept spacing properties
`

export const examples = {
  'Default': (
    <Card p={3}>Well would you look at that, I'm a card</Card>
  ),
  'Hoverable': (
    <Card hoverable p={3}>Hoverable cards have a shadow effect when hovered on.</Card>
  ),
  'Dark': (
    <Card dark p={3}>Dark cards are mysterious and read Edgar Allen Poe in their rooms</Card>
  ),
  'Faded': (
    <Card faded p={3}>Faded cards are good for distinguishing content areas rather than items. Hovers on faded cards should not be used.</Card>
  )
}
