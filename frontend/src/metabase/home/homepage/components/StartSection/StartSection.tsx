import React from "react";
import { jt, t } from "ttag";
import Ellipsified from "metabase/components/Ellipsified";
import ExternalLink from "metabase/components/ExternalLink";
import Link from "metabase/components/Link";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import Settings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { Dashboard, Database, User } from "../../types";
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

interface Props {
  user: User;
  databases: Database[];
  dashboards: Dashboard[];
  showPinMessage?: boolean;
  onHidePinMessage?: () => void;
}

const StartSection = ({
  user,
  databases,
  dashboards,
  showPinMessage,
  onHidePinMessage,
}: Props) => {
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
        <DashboardBanner user={user} onHidePinMessage={onHidePinMessage} />
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

interface DashboardCardProps {
  dashboard: Dashboard;
}

const DashboardCard = ({ dashboard }: DashboardCardProps) => {
  const dashboardUrl = Urls.dashboard(dashboard);

  return (
    <CardRoot to={dashboardUrl}>
      <CardIcon name="dashboard" />
      <CardTitle>
        <Ellipsified>{dashboard.name}</Ellipsified>
      </CardTitle>
    </CardRoot>
  );
};

const DatabaseBanner = () => {
  const userUrl = Urls.newUser();
  const databaseUrl = Urls.newDatabase();
  const docsUrl = Settings.docsUrl(
    "administration-guide/01-managing-databases",
  );

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
              {t`check out our setup guides`}
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

interface DashboardBannerProps {
  user: User;
  onHidePinMessage?: () => void;
}

const DashboardBanner = ({ user, onHidePinMessage }: DashboardBannerProps) => {
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
      {user.is_superuser && (
        <BannerCloseIcon name="close" onClick={onHidePinMessage} />
      )}
    </BannerRoot>
  );
};

export default StartSection;
