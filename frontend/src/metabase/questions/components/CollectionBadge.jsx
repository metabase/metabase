import React from "react";
import { Flex } from "grid-styled";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";

import * as Urls from "metabase/lib/urls";
import Collection from "metabase/entities/collections";

import cx from "classnames";

@Collection.load({
  id: (state, props) => props.collectionId || "root",
  wrapped: true,
  loadingAndErrorWrapper: false,
  properties: ["name"],
})
class CollectionBadge extends React.Component {
  render() {
    const { analyticsContext, object, className } = this.props;
    if (!object) {
      return null;
    }
    return (
      <Link
        to={Urls.collection(object.id)}
        className={cx(className, "block link")}
        data-metabase-event={`${analyticsContext};Collection Badge Click`}
      >
        <Flex align="center">
          <Icon name={object.getIcon()} mr={1} />
          <h5 className="text-uppercase" style={{ fontWeight: 900 }}>
            {object.name}
          </h5>
        </Flex>
      </Link>
    );
  }
}

export default CollectionBadge;
