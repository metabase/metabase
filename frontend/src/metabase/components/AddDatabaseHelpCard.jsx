import React, { useMemo } from "react";
import PropTypes from "prop-types";

import { t, jt } from "ttag";

import MetabaseSettings from "metabase/lib/settings";

import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";

import {
  CardContent,
  HelpCardContainer,
  IconContainer,
} from "./AddDatabaseHelpCard.styled";

export const ENGINE_DOCS = {
  bigquery: MetabaseSettings.docsUrl("administration-guide/databases/bigquery"),
  mongo: MetabaseSettings.docsUrl("administration-guide/databases/mongodb"),
  mysql: MetabaseSettings.docsUrl("administration-guide/databases/mysql"),
  oracle: MetabaseSettings.docsUrl("administration-guide/databases/oracle"),
  snowflake: MetabaseSettings.docsUrl(
    "administration-guide/databases/snowflake",
  ),
  vertica: MetabaseSettings.docsUrl("administration-guide/databases/vertica"),
};

export const GENERAL_DB_DOC = MetabaseSettings.docsUrl(
  "administration-guide/01-managing-databases",
);

export const CLOUD_HELP_URL = "https://www.metabase.com/help/cloud";

const propTypes = {
  engine: PropTypes.string.isRequired,
  hasCircle: PropTypes.bool,
};

function AddDatabaseHelpCard({ engine, hasCircle = true, ...props }) {
  const displayName = useMemo(() => {
    const hasEngineDoc = !!ENGINE_DOCS[engine];
    if (!hasEngineDoc) {
      return "your database";
    }
    const engines = MetabaseSettings.get("engines");
    return (engines[engine] || {})["driver-name"];
  }, [engine]);

  const docsLink = ENGINE_DOCS[engine] || GENERAL_DB_DOC;
  const shouldDisplayHelpLink = MetabaseSettings.isHosted();

  return (
    <HelpCardContainer p={2} {...props}>
      <IconContainer
        align="center"
        justify="center"
        className="flex-no-shrink circular"
        hasCircle={hasCircle}
      >
        <Icon size={20} name="database" className="text-brand" />
      </IconContainer>
      <CardContent
        flexDirection="column"
        justify="center"
        className="ml2"
        shouldDisplayHelpLink={shouldDisplayHelpLink}
      >
        <div>
          <p className="text-medium m0">
            {t`Need help setting up`} {displayName}?
          </p>
          <ExternalLink href={docsLink} className="text-brand text-bold">
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
              {t`Write us.`}
            </ExternalLink>
          </p>
        )}
      </CardContent>
    </HelpCardContainer>
  );
}

AddDatabaseHelpCard.propTypes = propTypes;

export default AddDatabaseHelpCard;
