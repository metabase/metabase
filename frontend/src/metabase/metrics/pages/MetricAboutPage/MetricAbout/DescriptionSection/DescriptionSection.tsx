import { jt, msgid, ngettext, t } from "ttag";

import { AboutSidebar } from "metabase/common/data-studio/components/AboutSidebar";
import { AboutHeader } from "metabase/common/data-studio/components/AboutSidebar/AboutHeader";
import { AboutSubSection } from "metabase/common/data-studio/components/AboutSidebar/AboutSubSection";
import { CardDescription } from "metabase/common/data-studio/components/AboutSidebar/CardDescription";
import { CardSourceSubSection } from "metabase/common/data-studio/components/AboutSidebar/CardSourceSubSection";
import { MetadataCard } from "metabase/common/data-studio/components/AboutSidebar/MetadataCard";
import { MetadataRow } from "metabase/common/data-studio/components/AboutSidebar/MetadataRow";
import { MetadataRowLink } from "metabase/common/data-studio/components/AboutSidebar/MetadataRowLink";
import type { MetricUrls } from "metabase/common/metrics/types";
import {
  getUserIsAdmin,
  getUserIsEntitledAnalyst,
} from "metabase/current-user";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { Card as CardApiType } from "metabase-types/api";

interface DescriptionSectionProps {
  card: CardApiType;
  urls: MetricUrls;
}

export function DescriptionSection({ card, urls }: DescriptionSectionProps) {
  const canSeeRelationships =
    useSelector(
      (state) => getUserIsAdmin(state) || getUserIsEntitledAnalyst(state),
    ) && PLUGIN_DEPENDENCIES.isEnabled;

  const { dependentsCount, dependenciesCount } =
    PLUGIN_DEPENDENCIES.useGetDependenciesCount({
      id: Number(card.id),
      type: "card",
    });

  const dependenciesUrl = urls.dependencies(card.id);

  return (
    <AboutSidebar data-testid="metric-description-sidebar">
      <AboutHeader updatedAt={card.updated_at} />
      <CardDescription card={card} />
      <CardSourceSubSection card={card} urls={urls} mt="xxl" />

      {canSeeRelationships && (
        <AboutSubSection title={t`Relationships`} mt="xxl">
          <MetadataCard>
            <MetadataRow icon="dependencies" muted={dependenciesCount === 0}>
              {dependenciesCount > 0 ? (
                <MetadataRowLink to={dependenciesUrl}>
                  {ngettext(
                    msgid`${dependenciesCount} dependency`,
                    `${dependenciesCount} dependencies`,
                    dependenciesCount,
                  )}
                </MetadataRowLink>
              ) : (
                t`No dependencies`
              )}
            </MetadataRow>
            <MetadataRow icon="dependent" muted={dependentsCount === 0}>
              {dependentsCount > 0
                ? jt`${(
                    <MetadataRowLink key="count" to={dependenciesUrl}>
                      {ngettext(
                        msgid`${dependentsCount} chart`,
                        `${dependentsCount} charts`,
                        dependentsCount,
                      )}
                    </MetadataRowLink>
                  )} ${ngettext(msgid`uses`, `use`, dependentsCount)} this metric`
                : t`No charts use this metric`}
            </MetadataRow>
          </MetadataCard>
        </AboutSubSection>
      )}
    </AboutSidebar>
  );
}
