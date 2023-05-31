import React from "react";
import { jt, t } from "ttag";
import Settings from "metabase/lib/settings";
import HelpCard from "metabase/components/HelpCard";
import ExternalLink from "metabase/core/components/ExternalLink";

export interface DatabaseHelpCardProps {
  className?: string;
  isHosted?: boolean;
}

const DatabaseHelpCard = ({
  className,
  isHosted,
}: DatabaseHelpCardProps): JSX.Element => {
  const docsUrl = Settings.docsUrl("databases/connecting");

  return (
    <HelpCard
      title={t`Need help connecting?`}
      className={className}
      isFullyClickable={!isHosted}
      helpUrl={docsUrl}
    >
      <p>{t`See our docs for step-by-step directions on how to connect your database.`}</p>
      {isHosted && (
        <p>
          {jt`Docs weren't enough? ${(
            <ExternalLink key="link" href="https://www.metabase.com/help/cloud">
              {t`Write us.`}
            </ExternalLink>
          )}`}
        </p>
      )}
    </HelpCard>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseHelpCard;
