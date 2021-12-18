import React from "react";
import { t, jt } from "ttag";
import ExternalLink from "metabase/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import { ExplorePlansIllustration } from "./ExplorePlansIllustration";
import {
  ExporePaidPlansContainer,
  SectionDescription,
  SectionHeader,
  SettingsLicenseContainer,
} from "../SettingsLicense.styled";

export const StarterContent = () => {
  return (
    <SettingsLicenseContainer>
      <SectionHeader>{t`Billing`}</SectionHeader>

      <SectionDescription>
        {t`Manage your Cloud account, including billing preferences, in your Metabase Store account.`}
      </SectionDescription>

      <ExternalLink
        href={MetabaseSettings.storeUrl()}
        className="Button Button--primary"
      >
        {t`Go to the Metabase Store`}
      </ExternalLink>

      <SectionHeader>{t`Looking for more?`}</SectionHeader>

      <SectionDescription>
        {jt`You can get priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers with ${(
          <ExternalLink href={MetabaseSettings.pricingUrl()}>
            {t`our other paid plans.`}
          </ExternalLink>
        )}`}
      </SectionDescription>

      <ExporePaidPlansContainer justifyContent="flex-end">
        <ExplorePlansIllustration />
      </ExporePaidPlansContainer>
    </SettingsLicenseContainer>
  );
};
