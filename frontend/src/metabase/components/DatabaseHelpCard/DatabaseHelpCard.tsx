import React from "react";
import { jt, t } from "ttag";
import Settings from "metabase/lib/settings";

import ExternalLink from "metabase/core/components/ExternalLink";
import HelpCard from "../HelpCard";

export interface DatabaseHelpCardProps {
  className?: string;
  isHosted?: boolean;
}

const DatabaseHelpCard = ({
  className,
  isHosted,
}: DatabaseHelpCardProps): JSX.Element => {
  const docsUrl = Settings.docsUrl(
    "administration-guide/01-managing-databases",
  );

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

export default DatabaseHelpCard;
