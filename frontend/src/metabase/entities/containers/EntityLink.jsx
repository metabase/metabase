/* eslint-disable react/prop-types */
import React from "react";

import Link from "metabase/components/Link";

import EntityObjectLoader from "./EntityObjectLoader";

const EntityLink = ({
  entityType,
  entityId,
  name = "name",
  LinkComponent = Link,
  ...linkProps
}) => (
  <EntityObjectLoader
    entityType={entityType}
    entityId={entityId}
    properties={[name]}
    loadingAndErrorWrapper={false}
    wrapped
  >
    {({ object }) =>
      object ? (
        <LinkComponent {...linkProps} to={object.getUrl()}>
          <span>{object.getName()}</span>
        </LinkComponent>
      ) : null
    }
  </EntityObjectLoader>
);

export default EntityLink;
