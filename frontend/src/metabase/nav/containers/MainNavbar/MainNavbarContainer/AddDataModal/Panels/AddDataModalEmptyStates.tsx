import type { ReactNode } from "react";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
import {
  Alert,
  Box,
  Button,
  Center,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";

import IconCSV from "./illustrations/csv.svg?component";

export const CONTENT_MAX_WIDTH = "22.5rem";
export const INNER_WIDTH = "12.5rem";

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
    <Alert icon={<Icon name="info" />} maw={CONTENT_MAX_WIDTH}>
      <Text fz="md" lh="lg">
        {getAlertCopy}
      </Text>
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
  upsell?: ReactNode;
}

const AddDataEmptyState = ({
  title,
  subtitle,
  illustration,
  ctaLink,
  contactAdminReason,
  upsell,
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
        <Button
          variant="filled"
          w={INNER_WIDTH}
          component={Link}
          to={ctaLink.to}
        >
          {ctaLink.text}
        </Button>
      )}
      {contactAdminReason && <ContactAdminAlert reason={contactAdminReason} />}
      {upsell}
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

export const CSVPanelEmptyState = ({
  ctaLink,
  contactAdminReason,
  upsell,
}:
  | {
      ctaLink: CTALink;
      contactAdminReason?: never;
      upsell?: ReactNode;
    }
  | {
      ctaLink?: never;
      contactAdminReason: ContactReason;
      upsell?: never;
    }) => {
  const text = (
    <Text component="span" td="underline">{c(
      "in the sentence 'To work with CSVs, enable file uploads in your database.'",
    ).t`your database`}</Text>
  );
  const ctaSubtitle = c("{0} refers to the string 'your database'")
    .jt`To work with CSVs, enable file uploads in ${(
    <Tooltip
      inline
      maw={INNER_WIDTH}
      multiline
      label={t`PostgreSQL, MySQL, Redshift, and ClickHouse databases are supported for file storage.`}
      key="database-tooltip"
    >
      {text}
    </Tooltip>
  )}.`;

  const subtitle = ctaLink
    ? ctaSubtitle
    : t`Work with CSVs, just like with any other data source.`;

  return (
    <AddDataEmptyState
      title={t`Upload CSV files`}
      subtitle={subtitle}
      illustration={<Box component={IconCSV} c="brand" h={66} />}
      contactAdminReason={contactAdminReason}
      ctaLink={ctaLink}
      upsell={upsell}
    />
  );
};
