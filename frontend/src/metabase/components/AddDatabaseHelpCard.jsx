import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { Flex } from "grid-styled";

import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";

import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";

const propTypes = {
  engine: PropTypes.string,
};

function AddDatabaseHelpCard({ engine, ...props }) {
  const displayName = useMemo(() => {
    const engines = MetabaseSettings.get("engines");
    return (engines[engine] || {})["driver-name"];
  }, [engine]);

  return (
    <Flex
      p={2}
      style={{ backgroundColor: "#F9FBFB", borderRadius: 10 }}
      {...props}
    >
      <Flex
        align="center"
        justify="center"
        className="circular"
        style={{
          minWidth: 52,
          minHeight: 52,
          backgroundColor: "#EEF2F5",
        }}
      >
        <Icon size={20} name="database" className="text-brand" />
      </Flex>
      <Flex flexDirection="column" justify="center" className="ml2">
        <p className="text-medium m0">
          {t`Need help setting up`} {displayName}?
        </p>
        <ExternalLink className="text-brand text-bold">
          {t`Our docs can help.`}
        </ExternalLink>
      </Flex>
    </Flex>
  );
}

AddDatabaseHelpCard.propTypes = propTypes;

export default AddDatabaseHelpCard;
