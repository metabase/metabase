import React from "react";
import { Flex } from "grid-styled";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";

import * as Urls from "metabase/lib/urls";
import colors, { lighten } from "metabase/lib/colors";

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
      object,
      className,
      hasBackground,
      style = {},
    } = this.props;
    if (!object) {
      return null;
    }
    const backgroundStyle = hasBackground
      ? {
          backgroundColor: lighten(colors["brand"], 0.55),
          paddingTop: "0.3em",
          paddingBottom: "0.3em",
          borderRadius: "0.4em",
        }
      : {};

    return (
      <Link
        to={Urls.collection(object.id)}
        className={cx(className, "block cursor-pointer", {
          px0: backgroundStyle,
        })}
        style={{
          ...backgroundStyle,
          ...style,
        }}
        data-metabase-event={`${analyticsContext};Collection Badge Click`}
      >
        <Flex align="center" className="text-medium text-brand-hover">
          <Icon name={object.getIcon()} mr={1} size={13} />
          <h4 className="text-bold">{object.name}</h4>
        </Flex>
      </Link>
    );
  }
}

export default CollectionBadge;
