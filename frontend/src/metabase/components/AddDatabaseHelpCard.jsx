import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { Flex } from "grid-styled";

import { t, jt } from "ttag";

import MetabaseSettings from "metabase/lib/settings";

import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";

const propTypes = {
  engine: PropTypes.string,
};

const CLOUD_HELP_URL = "https://www.metabase.com/help/cloud";

function AddDatabaseHelpCard({ engine, ...props }) {
  const displayName = useMemo(() => {
    const engines = MetabaseSettings.get("engines");
    return (engines[engine] || {})["driver-name"];
  }, [engine]);

  const shouldDisplayHelpLink = MetabaseSettings.isHosted();

  return (
    <Flex
      p={2}
      style={{ backgroundColor: "#F9FBFB", borderRadius: 10, minWidth: 300 }}
      {...props}
    >
      <Flex
        align="center"
        justify="center"
        className="flex-no-shrink circular"
        style={{
          width: 52,
          height: 52,
          backgroundColor: "#EEF2F5",
        }}
      >
        <Icon size={20} name="database" className="text-brand" />
      </Flex>
      <Flex
        flexDirection="column"
        justify="center"
        className="ml2"
        style={{ marginTop: shouldDisplayHelpLink ? "8px" : 0 }}
      >
        <div>
          <p className="text-medium m0">
            {t`Need help setting up`} <span>{displayName}</span>?
          </p>
          <ExternalLink className="text-brand text-bold">
            {t`Our docs can help.`}
          </ExternalLink>
        </div>
        {shouldDisplayHelpLink && (
          <p className="mt2 text-medium m0">
            {jt`Docs weren't enough?`}{" "}
            <ExternalLink
              href={CLOUD_HELP_URL}
              className="text-brand text-bold"
            >
              Write us.
            </ExternalLink>
          </p>
        )}
      </Flex>
    </Flex>
  );
}

AddDatabaseHelpCard.propTypes = propTypes;

export default AddDatabaseHelpCard;
