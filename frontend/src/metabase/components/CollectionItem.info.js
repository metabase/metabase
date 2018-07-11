import React from "react"
import CollectionItem from "metabase/components/CollectionItem"

export const component = CollectionItem
export const description = `represents a collection`

const exampleCollection = {
  collection: {
    id: 1,
    name: "Test collection"
  }
}

export const examples = {
  Default: (
    <CollectionItem {...exampleCollection} />
  )
}
