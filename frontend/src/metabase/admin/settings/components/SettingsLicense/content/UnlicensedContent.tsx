import React from "react";
import { t } from "ttag";
import ExternalLink from "metabase/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import {
  ExporePaidPlansContainer,
  SectionDescription,
  SectionHeader,
  SettingsLicenseContainer,
  SubHeader,
} from "../SettingsLicense.styled";
import { ExplorePlansIllustration } from "./ExplorePlansIllustration";

const description = t`Metabase is open source and will be free forever – but by upgrading you can have priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers.`;

export const UnlicensedContent = () => {
  return (
    <>
      <SectionHeader>{t`Looking for more?`}</SectionHeader>

      <SectionDescription>{description}</SectionDescription>

      <SubHeader>{t`Want to know more?`}</SubHeader>

      <ExporePaidPlansContainer>
        <ExternalLink
          className="Button Button--primary"
          href={MetabaseSettings.upgradeUrl()}
        >{t`Explore our paid plans`}</ExternalLink>

        <ExplorePlansIllustration />
      </ExporePaidPlansContainer>
    </>
  );
};
