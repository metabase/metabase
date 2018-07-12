import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import * as Urls from "metabase/lib/urls";

import cx from "classnames";

@entityObjectLoader({
  entityType: "collections",
  entityId: (state, props) => props.collectionId || "root",
  wrapped: true,
})
class CollectionBadge extends React.Component {
  render() {
    const { object } = this.props;
    return (
      <Link
        to={Urls.collection(object.id)}
        className={cx("flex align-center link")}
      >
        <Icon name={object.getIcon()} mr={1} />
        <h5 className="text-uppercase" style={{ fontWeight: 900 }}>
          {object.name}
        </h5>
      </Link>
    );
  }
}

export default CollectionBadge;
