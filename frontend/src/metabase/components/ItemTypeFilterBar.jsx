import React from "react"
import { Flex } from "grid-styled"
import { t } from 'c-3po'
import { withRouter } from "react-router"

import Link from "metabase/components/Link"

import colors from "metabase/lib/colors"

const FILTERS = [
  {
    name: t`All items`,
    filter: null
  },
  {
    name: t`Dashboards`,
    filter: 'dashbaords'
  },
  {
    name: t`Questions`,
    filter: 'questions'
  },
  {
    name: t`Pulses`,
    filter: 'pulses'
  },
]

const ItemTypeFilterBar = (props) => {
  const { location } = props
  return (
    <Flex align='center' className="border-bottom">
      { FILTERS.map(f => {
        const isActive = location.query.type === f.filter
        const color = isActive ? colors.brand : 'inherit'
        return (
          <Link
            to={{
              pathname: location.pathname,
              query: f.filter ? { type: f.filter } : null}}
            color={color}
            mr={2}
            py={1}
            style={{
              borderBottom: `2px solid ${isActive ? colors.brand : 'transparent'}`}}
          >
            <h4>{f.name}</h4>
          </Link>
        )
      })}
    </Flex>
  )
}

export default withRouter(ItemTypeFilterBar)
