import React from "react";
import { Flex } from "grid-styled";

import Link from "metabase/components/Link";
import Icon from "metabase/components/Icon";

import { lighten } from "metabase/lib/colors";

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
    const {
      analyticsContext,
      collection,
      className,
      hasBackground,
      style = {},
    } = this.props;
    if (!collection) {
      return null;
    }
    const backgroundStyle = hasBackground
      ? {
          backgroundColor: lighten("brand"),
          paddingTop: "0.3em",
          paddingBottom: "0.3em",
          borderRadius: "0.4em",
        }
      : {};

    return (
      <Link
        to={collection.getUrl()}
        className={cx(
          className,
          "block cursor-pointer h4 text-bold text-medium text-brand-hover",
          { px1: hasBackground },
        )}
        style={{
          ...backgroundStyle,
          ...style,
        }}
        data-metabase-event={`${analyticsContext};Collection Badge Click`}
      >
        <Flex align="center">
          <Icon name={collection.getIcon()} mr={1} size={13} />
          <span className="text-wrap">{collection.getName()}</span>
        </Flex>
      </Link>
    );
  }
}

export default CollectionBadge;
