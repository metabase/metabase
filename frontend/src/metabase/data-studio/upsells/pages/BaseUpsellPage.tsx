import { useUpgradeAction } from "metabase/admin/upsells/components/UpgradeModal";
import { DATA_STUDIO_UPGRADE_URL } from "metabase/admin/upsells/constants";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { UpsellCardContent } from "metabase/data-studio/upsells/components/UpsellCardContent";
import { Stack } from "metabase/ui";

import { DottedBackground } from "../components/DottedBackground";
import { LineDecorator } from "../components/LineDecorator";

import S from "./BaseUpsellPage.module.css";

export type BaseUpsellPageProps = {
  campaign: string;
  location: string;
  header: string;
  title: string;
  description: string;
  bulletPoints?: string[];
  image?: string;
  variant?: "image-full-height" | "image-card";
};

export function BaseUpsellPage({
  campaign,
  location,
  header,
  title,
  description,
  bulletPoints,
  image,
  variant,
}: BaseUpsellPageProps) {
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: DATA_STUDIO_UPGRADE_URL,
    campaign,
    location,
  });

  return (
    <DottedBackground px="3.5rem" pb="2rem">
      <PaneHeader
        breadcrumbs={<DataStudioBreadcrumbs>{header}</DataStudioBreadcrumbs>}
      />
      <Stack align="center" p={40} className={S.UpsellPageContent}>
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={location}
            title={title}
            description={description}
            bulletPoints={bulletPoints}
            image={image}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            variant={variant}
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
}
