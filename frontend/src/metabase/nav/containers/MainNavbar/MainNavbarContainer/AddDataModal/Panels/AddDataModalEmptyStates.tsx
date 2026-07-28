import type { ReactNode } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { StoragePurchaseButton } from "metabase/common/components/upsells/StoragePurchaseModal";
import { useSelector } from "metabase/redux";
import { Link } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";
import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";

import IconCSV from "./illustrations/csv.svg?component";

export const CONTENT_MAX_WIDTH = "22.5rem";
export const INNER_WIDTH = "12.5rem";

/** Shared by both tabs so their loading states can't drift apart visually. */
export const PanelLoadingState = () => (
  <Center h="100%">
    <Loader data-testid="loading-indicator" />
  </Center>
);

type ContactReason =
  | "add-database"
  | "enable-csv-upload"
  | "obtain-csv-upload-permission"
  | "enable-google-sheets";

export const ContactAdminAlert = ({ reason }: { reason: ContactReason }) => {
  const adminEmail = useSelector((state) => getSetting(state, "admin-email"));
  const adminEmailElement = <b key="admin-email">{adminEmail}</b>;

  const hasAdminEmail = !!adminEmail;

  const getAlertCopy = match({ reason, hasAdminEmail })
    .with(
      { reason: "add-database", hasAdminEmail: true },
      () =>
        c("{0} is admin's email address")
          .jt`To add a new database, please contact your administrator at ${adminEmailElement}.`,
    )
    .with(
      { reason: "add-database", hasAdminEmail: false },
      () => t`To add a new database, please contact your administrator.`,
    )
    .with(
      { reason: "enable-csv-upload", hasAdminEmail: true },
      () =>
        c("{0} is admin's email address")
          .jt`To enable CSV file upload, please contact your administrator at ${adminEmailElement}.`,
    )
    .with(
      { reason: "enable-csv-upload", hasAdminEmail: false },
      () => t`To enable CSV file upload, please contact your administrator.`,
    )
    .with(
      {
        reason: "obtain-csv-upload-permission",
        hasAdminEmail: true,
      },
      () =>
        c("{0} is admin's email address")
          .jt`You are not permitted to upload CSV files. To get proper permissions, please contact your administrator at ${adminEmailElement}.`,
    )
    .with(
      {
        reason: "obtain-csv-upload-permission",
        hasAdminEmail: false,
      },
      () =>
        t`You are not permitted to upload CSV files. To get proper permissions, please contact your administrator.`,
    )
    .with(
      {
        reason: "enable-google-sheets",
        hasAdminEmail: true,
      },
      () =>
        c("{0} is admin's email address")
          .jt`To enable Google Sheets import, please contact your administrator at ${adminEmailElement}.`,
    )
    .with(
      { reason: "enable-google-sheets", hasAdminEmail: false },
      () =>
        t`To enable Google Sheets import, please contact your administrator.`,
    )
    .exhaustive();

  return (
    <Alert
      size="compact"
      variant="light"
      icon={<Icon name="info" />}
      maw={CONTENT_MAX_WIDTH}
    >
      {getAlertCopy}
    </Alert>
  );
};

interface CTALink {
  text: string;
  to: string;
}

interface EmptyStateProps {
  title: string;
  subtitle: ReactNode;
  illustration: ReactNode;
  ctaLink?: CTALink;
  contactAdminReason?: ContactReason;
  secondaryAction?: ReactNode;
}

const AddDataEmptyState = ({
  title,
  subtitle,
  illustration,
  ctaLink,
  contactAdminReason,
  secondaryAction,
}: EmptyStateProps) => {
  return (
    <Stack gap="lg" align="center" justify="center" pt="2.5rem">
      {illustration}
      <Box component="header" ta="center" maw={CONTENT_MAX_WIDTH}>
        <Title order={2} size="h4" mb="xs">
          {title}
        </Title>
        <Text c="text-secondary">{subtitle}</Text>
      </Box>
      {ctaLink && (
        <Group gap="sm" justify="center">
          <Button
            variant="filled"
            w={secondaryAction ? undefined : INNER_WIDTH}
            component={Link}
            to={ctaLink.to}
          >
            {ctaLink.text}
          </Button>
          {secondaryAction}
        </Group>
      )}
      {contactAdminReason && <ContactAdminAlert reason={contactAdminReason} />}
    </Stack>
  );
};

export const DatabasePanelEmptyState = () => {
  const illustration = getSubpathSafeUrl(
    "app/assets/img/empty-states/databases.svg",
  );

  return (
    <AddDataEmptyState
      title={t`Add a database`}
      subtitle={t`Start exploring in minutes. We support more than 20 data connectors.`}
      illustration={<Center component="img" src={illustration} w="3rem" />}
      contactAdminReason="add-database"
    />
  );
};

const CSVIllustration = () => <Box component={IconCSV} c="core-brand" h={48} />;

/**
 * Shared by the CSV and Sheets panels: the instance is entitled to storage (the
 * `attached_dwh` token is present) but the DWH database has not shown up yet —
 * either it is still provisioning, or the token runs ahead of the data. A reload
 * re-fetches the databases list, so pointing at a refresh is the honest hint.
 */
export const getStorageNotProvisionedSubtitle = () =>
  t`You don't have storage provisioned yet. Refresh this page after 1-2 minutes.`;

export const CSVStorageNotProvisionedEmptyState = () => (
  <AddDataEmptyState
    title={t`Upload CSV files`}
    subtitle={getStorageNotProvisionedSubtitle()}
    illustration={<CSVIllustration />}
  />
);

export const CSVPanelEmptyState = ({
  ctaLink,
  contactAdminReason,
  canOfferStorage,
}:
  | {
      ctaLink: CTALink;
      contactAdminReason?: never;
      canOfferStorage?: boolean;
    }
  | {
      ctaLink?: never;
      contactAdminReason: ContactReason;
      canOfferStorage?: never;
    }) => {
  const ctaSubtitle = canOfferStorage
    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins
      t`To work with CSVs, either enable file uploads in your database, or add Metabase Storage.`
    : t`To work with CSVs, enable file uploads in your database.`;

  const subtitle = ctaLink
    ? ctaSubtitle
    : t`Work with CSVs, just like with any other data source.`;

  return (
    <AddDataEmptyState
      title={t`Upload CSV files`}
      subtitle={subtitle}
      illustration={<CSVIllustration />}
      contactAdminReason={contactAdminReason}
      ctaLink={ctaLink}
      secondaryAction={
        canOfferStorage ? (
          <StoragePurchaseButton location="add-data-modal-csv" />
        ) : undefined
      }
    />
  );
};
