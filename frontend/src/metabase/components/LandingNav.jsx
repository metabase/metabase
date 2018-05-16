import React from "react";
import { Absolute } from "rebass";
import { t } from "c-3po";

import { normal } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Tooltip from "metabase/components/Tooltip";

const ICON_SIZE = 18;

const FilterLink = ({ to, children, tooltip }) => (
  <Tooltip tooltip={tooltip}>
    <Link
      to={to}
      p={2}
      color={normal.grey2}
      activeStyle={{
        backgroundColor: normal.blue,
        color: "white",
      }}
      hover={{
        color: normal.blue,
        backgroundColor: `rgb(242, 244, 245)`,
      }}
      style={{
        display: "block",
        borderRadius: 6,
        lineHeight: 1,
      }}
    >
      {children}
    </Link>
  </Tooltip>
);

const LandingNav = props => {
  const { collectionId } = props;

  function showEntity(type) {
    return {
      pathname: collectionId ? `collection/${collectionId}` : "",
      query: { show: type },
    };
  }

  return (
    <Absolute top={0} left={0} px={2} pt={1}>
      <FilterLink to={showEntity()} tooltip={t`Collection Guide`}>
        <Icon name="reference" size={ICON_SIZE} />
      </FilterLink>

      <FilterLink to={showEntity("dashboards")} tooltip={t`Show dashboards`}>
        <Icon name="dashboard" size={ICON_SIZE} />
      </FilterLink>

      <FilterLink to={showEntity("pulses")} tooltip={t`Show pulses`}>
        <Icon name="pulse" size={ICON_SIZE} />
      </FilterLink>

      <FilterLink to={showEntity("questions")} tooltip={t`Show questions`}>
        <Icon name="beaker" size={ICON_SIZE} />
      </FilterLink>
    </Absolute>
  );
};

export default LandingNav;
