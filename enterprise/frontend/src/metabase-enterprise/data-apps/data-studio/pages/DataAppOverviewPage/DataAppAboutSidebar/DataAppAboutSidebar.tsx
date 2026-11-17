import cx from "classnames";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import { Markdown } from "metabase/common/components/Markdown";
import { AboutSidebar } from "metabase/common/data-studio/components/AboutSidebar";
import { AboutHeader } from "metabase/common/data-studio/components/AboutSidebar/AboutHeader";
import { AboutSubSection } from "metabase/common/data-studio/components/AboutSidebar/AboutSubSection";
import { MetadataCard } from "metabase/common/data-studio/components/AboutSidebar/MetadataCard";
import { MetadataRow } from "metabase/common/data-studio/components/AboutSidebar/MetadataRow";
import { MetadataRowLink } from "metabase/common/data-studio/components/AboutSidebar/MetadataRowLink";
import CS from "metabase/css/core/index.css";
import { useSetting } from "metabase/settings";
import { Box } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useGetDataAppGroupsQuery,
  useGetDataAppRepoStatusQuery,
} from "metabase-enterprise/api";
import type { DataApp } from "metabase-types/api";

import { getDataAppSourceLocation, isDataAppOpenable } from "../../../../utils";

type DataAppAboutSidebarProps = {
  app: DataApp;
};

export function DataAppAboutSidebar({ app }: DataAppAboutSidebarProps) {
  const { data: groups = [] } = useGetDataAppGroupsQuery(app.slug);
  const appUrl = Urls.dataApp(app.slug);

  return (
    <AboutSidebar flex="0 0 360px" data-testid="data-app-about-sidebar">
      <AboutHeader updatedAt={app.updated_at} />
      <Box mt="lg">
        <Markdown>{app.description || t`No description`}</Markdown>
      </Box>
      <AboutSubSection title={t`Status`} mt="xxl">
        <MetadataCard>
          <MetadataRow icon={app.enabled ? "eye" : "eye_crossed_out"}>
            {app.enabled ? t`Live` : t`Draft`}
          </MetadataRow>
          {app.outdated && (
            <MetadataRow icon="warning">{t`Outdated`}</MetadataRow>
          )}
        </MetadataCard>
      </AboutSubSection>
      <AboutSubSection title={t`Address`} mt="xxl">
        <MetadataCard>
          <MetadataRow icon="link">
            {isDataAppOpenable(app) ? (
              <MetadataRowLink to={appUrl}>{appUrl}</MetadataRowLink>
            ) : (
              appUrl
            )}
          </MetadataRow>
        </MetadataCard>
      </AboutSubSection>
      <AboutSubSection title={t`External hosts`} mt="xxl">
        <MetadataCard withConnector={false}>
          {app.allowed_hosts.length > 0 ? (
            app.allowed_hosts.map((host) => (
              <MetadataRow key={host} icon="globe">
                <span className={CS.textBreakAll}>{host}</span>
              </MetadataRow>
            ))
          ) : (
            <MetadataRow icon="globe" muted>
              {t`No external hosts`}
            </MetadataRow>
          )}
        </MetadataCard>
      </AboutSubSection>
      <DataAppRepositorySection slug={app.slug} />
      <AboutSubSection title={t`Group access`} mt="xxl">
        <MetadataCard>
          {groups.length > 0 ? (
            groups.map((group) => (
              <MetadataRow key={group.id} icon="group">
                <MetadataRowLink
                  to={Urls.dataStudioDataAppPermissions(app.slug)}
                >
                  {group.name}
                </MetadataRowLink>
              </MetadataRow>
            ))
          ) : (
            <MetadataRow icon="group" muted>
              {t`No groups`}
            </MetadataRow>
          )}
        </MetadataCard>
      </AboutSubSection>
    </AboutSidebar>
  );
}

type DataAppRepositorySectionProps = {
  slug: string;
};

function DataAppRepositorySection({ slug }: DataAppRepositorySectionProps) {
  const { data: repoStatus, isLoading } = useGetDataAppRepoStatusQuery();

  if (isLoading) {
    return null;
  }

  return (
    <AboutSubSection title={t`Repository`} mt="xxl">
      <MetadataCard>
        {repoStatus === undefined ? (
          <MetadataRow icon="warning" muted>
            {t`Couldn't load the repository`}
          </MetadataRow>
        ) : (
          <DataAppRepositoryRow repoUrl={repoStatus.url} slug={slug} />
        )}
      </MetadataCard>
    </AboutSubSection>
  );
}

type DataAppRepositoryRowProps = {
  repoUrl: string | null;
  slug: string;
};

function DataAppRepositoryRow({ repoUrl, slug }: DataAppRepositoryRowProps) {
  const branch = useSetting("remote-sync-branch");

  if (repoUrl === null) {
    return (
      <MetadataRow icon="git_branch" muted>
        {t`No repository connected`}
      </MetadataRow>
    );
  }

  const location = getDataAppSourceLocation({
    repoUrl,
    branch,
    slug,
  });

  if (location.type === "link") {
    return (
      <MetadataRow icon="git_branch">
        <MetadataRowLink href={location.url}>
          <span className={CS.textBreakAll}>{location.url}</span>
        </MetadataRowLink>
      </MetadataRow>
    );
  }

  return (
    <MetadataRow
      icon="git_branch"
      rightSection={
        <CopyButton
          value={location.text}
          aria-label={t`Copy repository location`}
          className={cx(CS.textBrandHover, CS.flex)}
        />
      }
    >
      <span className={CS.textBreakAll}>{location.text}</span>
    </MetadataRow>
  );
}
