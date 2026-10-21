import { t } from "ttag";

import { Markdown } from "metabase/common/components/Markdown";
import { AboutSidebar } from "metabase/common/data-studio/components/AboutSidebar";
import { AboutHeader } from "metabase/common/data-studio/components/AboutSidebar/AboutHeader";
import { AboutSubSection } from "metabase/common/data-studio/components/AboutSidebar/AboutSubSection";
import { MetadataCard } from "metabase/common/data-studio/components/AboutSidebar/MetadataCard";
import { MetadataRow } from "metabase/common/data-studio/components/AboutSidebar/MetadataRow";
import { MetadataRowLink } from "metabase/common/data-studio/components/AboutSidebar/MetadataRowLink";
import { Box } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetDataAppGroupsQuery } from "metabase-enterprise/api";
import type { DataApp } from "metabase-types/api";

import { isDataAppOpenable } from "../../../utils";

type DataAppAboutSidebarProps = {
  app: DataApp;
};

export function DataAppAboutSidebar({ app }: DataAppAboutSidebarProps) {
  const { data: groups = [] } = useGetDataAppGroupsQuery(app.name);
  const appUrl = Urls.dataApp(app.name);

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
      <AboutSubSection title={t`Group access`} mt="xxl">
        <MetadataCard>
          {groups.length > 0 ? (
            groups.map((group) => (
              <MetadataRow key={group.id} icon="group">
                {group.name}
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
