import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { HelpCard } from "metabase/common/components/HelpCard";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";

export interface DatabaseHelpCardProps {
  className?: string;
}

export const DatabaseHelpCard = ({
  className,
}: DatabaseHelpCardProps): JSX.Element => {
  const docsUrl = useSelector((state) =>
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Metabase setup
    getDocsUrl(state, { page: "databases/connecting" }),
  );
  const isHosted = useSelector((state) => getSetting(state, "is-hosted?"));

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
