import React from "react"
import ItemTypeFilterBar from "metabase/components/ItemTypeFilterBar"
import CollectionItem from "metabase/components/CollectionItem"

//export const component = ItemTypeFilterBar
export const component = CollectionItem
export const description = `
  Applies a set of filters to the url to filter by common item types
`
export const examples = {
  Default: (
    <ItemTypeFilterBar />
  )
}
