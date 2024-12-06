/* eslint-disable react/prop-types */
import Link from "metabase/core/components/Link";

import { EntityObjectLoaderRtkQuery } from "./rtk-query";

const EntityLink = ({
  entityType,
  entityId,
  name = "name",
  LinkComponent = Link,
  dispatchApiErrorEvent = true,
  fallback = null,
  ...linkProps
}) => (
  <EntityObjectLoaderRtkQuery
    ComposedComponent={({ object }) =>
      object ? (
        <LinkComponent {...linkProps} to={object.getUrl()}>
          <span>{object.getName()}</span>
        </LinkComponent>
      ) : (
        fallback
      )
    }
    entityType={entityType}
    entityId={entityId}
    properties={[name]}
    loadingAndErrorWrapper={false}
    dispatchApiErrorEvent={dispatchApiErrorEvent}
    wrapped
  />
);

export default EntityLink;
