/* eslint-disable react/prop-types */
import Link from "metabase/core/components/Link";

import EntityObjectLoader from "./EntityObjectLoader";

const EntityLink = ({
  entityType,
  entityId,
  name = "name",
  LinkComponent = Link,
  dispatchApiErrorEvent = true,
  fallback = null,
  ...linkProps
}) => (
  <EntityObjectLoader
    entityType={entityType}
    entityId={entityId}
    properties={[name]}
    loadingAndErrorWrapper={false}
    dispatchApiErrorEvent={dispatchApiErrorEvent}
    wrapped
  >
    {({ object }) =>
      object ? (
        <LinkComponent {...linkProps} to={object.getUrl()}>
          <span>{object.getName()}</span>
        </LinkComponent>
      ) : (
        fallback
      )
    }
  </EntityObjectLoader>
);

export default EntityLink;
