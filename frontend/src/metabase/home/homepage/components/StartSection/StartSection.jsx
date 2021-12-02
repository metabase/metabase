import React from "react";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import Settings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import Link from "metabase/components/Link";
import ExternalLink from "metabase/components/ExternalLink";
import Section, { SectionHeader, SectionTitle } from "../Section";
import {
  BannerCloseIcon,
  BannerContent,
  BannerDescription,
  BannerIconContainer,
  BannerModelIcon,
  BannerRoot,
  BannerTitle,
  CardIcon,
  CardRoot,
  CardTitle,
  ListRoot,
} from "./StartSection.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
  databases: PropTypes.array.isRequired,
  dashboards: PropTypes.array.isRequired,
  showPinMessage: PropTypes.bool,
  onHidePinMessage: PropTypes.func,
};

const StartSection = ({
  user,
  databases,
  dashboards,
  showPinMessage,
  onHidePinMessage,
}) => {
  const showDatabaseBanner =
    user.is_superuser && !databases.some(d => !d.is_sample);
  const showDashboardBanner =
    !dashboards.length && showPinMessage && !showDatabaseBanner;
  const showDashboardList = dashboards.length > 0;

  if (!showDatabaseBanner && !showDashboardBanner && !showDashboardList) {
    return null;
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Start here`}</SectionTitle>
      </SectionHeader>
      {showDatabaseBanner && <DatabaseBanner />}
      {showDashboardBanner && (
        <DashboardBanner onHidePinMessage={onHidePinMessage} />
      )}
      {showDashboardList && (
        <ListRoot hasMargin={showDatabaseBanner}>
          {dashboards.map(dashboard => (
            <DashboardCard key={dashboard.id} dashboard={dashboard} />
          ))}
        </ListRoot>
      )}
    </Section>
  );
};

StartSection.propTypes = propTypes;

const cardProps = {
  dashboard: PropTypes.object,
};

const DashboardCard = ({ dashboard }) => {
  const dashboardUrl = Urls.dashboard(dashboard);

  return (
    <CardRoot to={dashboardUrl}>
      <CardIcon name="dashboard" />
      <CardTitle>{dashboard.name}</CardTitle>
    </CardRoot>
  );
};

DashboardCard.propTypes = cardProps;

const DatabaseBanner = () => {
  const userUrl = Urls.newUser();
  const databaseUrl = Urls.newDatabase();
  const docsUrl = Settings.docsUrl("getting-started");

  return (
    <BannerRoot>
      <BannerIconContainer>
        <BannerModelIcon name="database" />
      </BannerIconContainer>
      <BannerContent>
        <BannerTitle>{t`Connect your data to get the most out of Metabase`}</BannerTitle>
        <BannerDescription>
          {jt`If you need help, you can ${(
            <ExternalLink href={userUrl}>{t`invite a teammate`}</ExternalLink>
          )} or ${(
            <ExternalLink href={docsUrl}>
              {t`check out our set up guides`}
            </ExternalLink>
          )}.`}
        </BannerDescription>
      </BannerContent>
      <Link
        className="Button Button--primary"
        to={databaseUrl}
      >{t`Add my data`}</Link>
    </BannerRoot>
  );
};

const dashboardBannerProps = {
  onHidePinMessage: PropTypes.func,
};

const DashboardBanner = ({ onHidePinMessage }) => {
  const collectionUrl = Urls.collection(ROOT_COLLECTION);

  return (
    <BannerRoot>
      <BannerIconContainer>
        <BannerModelIcon name="pin" />
      </BannerIconContainer>
      <BannerContent>
        <BannerTitle>{t`Your teams’ most important dashboards go here`}</BannerTitle>
        <BannerDescription>{jt`Pin dashboards in ${(
          <ExternalLink href={collectionUrl}>
            {ROOT_COLLECTION.name}
          </ExternalLink>
        )} to have them appear in this space for everyone.`}</BannerDescription>
      </BannerContent>
      <BannerCloseIcon name="close" onClick={onHidePinMessage} />
    </BannerRoot>
  );
};

DashboardBanner.propTypes = dashboardBannerProps;

export default StartSection;
