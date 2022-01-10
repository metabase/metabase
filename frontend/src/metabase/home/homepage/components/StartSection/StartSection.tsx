import React from "react";
import { jt, t } from "ttag";
import Ellipsified from "metabase/components/Ellipsified";
import ExternalLink from "metabase/components/ExternalLink";
import Link from "metabase/components/Link";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import Settings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { Dashboard, Database, User } from "metabase-types/api";
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

export interface StartSectionProps {
  user: User;
  databases: Database[];
  dashboards: Dashboard[];
  showPinMessage?: boolean;
  onHidePinMessage?: () => void;
  onDashboardClick?: (dashboard: Dashboard) => void;
}

const StartSection = ({
  user,
  databases,
  dashboards,
  showPinMessage,
  onHidePinMessage,
  onDashboardClick,
}: StartSectionProps): JSX.Element | null => {
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
      {showDatabaseBanner && <DatabaseBanner user={user} />}
      {showDashboardBanner && (
        <DashboardBanner user={user} onHidePinMessage={onHidePinMessage} />
      )}
      {showDashboardList && (
        <ListRoot hasMargin={showDatabaseBanner}>
          {dashboards.map(dashboard => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              onDashboardClick={onDashboardClick}
            />
          ))}
        </ListRoot>
      )}
    </Section>
  );
};

interface DashboardCardProps {
  dashboard: Dashboard;
  onDashboardClick?: (dashboard: Dashboard) => void;
}

const DashboardCard = ({
  dashboard,
  onDashboardClick,
}: DashboardCardProps): JSX.Element => {
  const dashboardUrl = Urls.dashboard(dashboard);

  return (
    <CardRoot to={dashboardUrl} onClick={() => onDashboardClick?.(dashboard)}>
      <CardIcon name="dashboard" />
      <CardTitle>
        <Ellipsified>{dashboard.name}</Ellipsified>
      </CardTitle>
    </CardRoot>
  );
};

export interface DatabaseBannerProps {
  user: User;
}

const DatabaseBanner = ({ user }: DatabaseBannerProps): JSX.Element => {
  const userUrl = Urls.newUser();
  const userLabel = user.has_invited_second_user
    ? t`invite another teammate`
    : t`invite a teammate`;
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
            <ExternalLink href={userUrl}>{userLabel}</ExternalLink>
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

const DashboardBanner = ({
  user,
  onHidePinMessage,
}: DashboardBannerProps): JSX.Element => {
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
