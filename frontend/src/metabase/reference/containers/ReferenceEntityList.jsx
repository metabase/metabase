import React from "react";
import { Link } from "react-router"

import { Text } from "../ReferenceApp.jsx"

import { INSIGHTS } from "../fixture_data.delete.js";

const EntityTitle=({children}) => <h2>{children}</h2>

const ReferenceEntityListItem = ({name, href, description}) =>
  <Link to={href} className="py2 block border-bottom link">
    <EntityTitle>{name}</EntityTitle>
    <Text className="text-normal text-grey-1">{description}</Text>
  </Link>

const ReferenceEntityList = ({entities, params}) => {
    const href = `${params.entity}/1`
    return (
        <ul className="wrapper">
            {
              entities.map((insight, index) =>
                <li key={index}>
                  <ReferenceEntityListItem {...insight} href={href} />
                </li>
              )
            }
        </ul>
    )
}

ReferenceEntityList.defaultProps = {
  entities: INSIGHTS
}

export default ReferenceEntityList
