import React from "react";
import PropTypes from "prop-types";
import { t, jt } from "ttag";
import Settings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import Link from "metabase/components/Link";
import Section, { SectionHeader, SectionTitle } from "../LandingSection";
import {
  BannerContent,
  BannerDescription,
  BannerIcon,
  BannerIconContainer,
  BannerRoot,
  BannerTitle,
} from "./StartHereSection.styled";
import ExternalLink from "metabase/components/ExternalLink";

const propTypes = {
  isAdmin: PropTypes.bool,
  onRemoveSection: PropTypes.func,
};

const StartHereSection = () => {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Start here`}</SectionTitle>
      </SectionHeader>
      <DatabaseBanner />
    </Section>
  );
};

StartHereSection.propTypes = propTypes;

const DatabaseBanner = () => {
  const userLink = Urls.newUser();
  const docsLink = Settings.docsUrl("getting-started");

  return (
    <BannerRoot>
      <BannerIconContainer>
        <BannerIcon name="database" />
      </BannerIconContainer>
      <BannerContent>
        <BannerTitle>{t`Connect your data to get the most out of Metabase`}</BannerTitle>
        <BannerDescription>
          {jt`If you need help, you can ${(
            <Link to={userLink}>{t`invite a teammate`}</Link>
          )} or ${(
            <ExternalLink href={docsLink}>
              {t`check out our set up guides`}
            </ExternalLink>
          )}.`}
        </BannerDescription>
      </BannerContent>
    </BannerRoot>
  );
};

export default StartHereSection;
