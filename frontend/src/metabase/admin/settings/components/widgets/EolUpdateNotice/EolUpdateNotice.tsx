import cx from "classnames";
import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useGetVersionInfoQuery, useSetting } from "metabase/settings";
import { Anchor, Box, Icon, Text } from "metabase/ui";

import S from "./EolUpdateNotice.module.css";
import { getEolDate } from "./utils";

interface EolUpdateNoticeProps {
  showAfterEolOnly?: boolean;
}

export function EolUpdateNotice({
  showAfterEolOnly = false,
}: EolUpdateNoticeProps) {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const version = useSetting("version");

  if (!versionInfo || !version.tag) {
    return null;
  }

  const eolDate = getEolDate(versionInfo, version.tag);

  if (!eolDate) {
    return null;
  }

  const isAfterEol = new Date() > eolDate;

  if (isAfterEol) {
    return (
      <Box className={cx(S.root, S.afterEol)}>
        <Icon name="warning" c="feedback-warning" />
        <Text fw="bold">{t`This version of Metabase has reached end-of-life and will no longer receive updates.`}</Text>
        <LearnMoreLink />
      </Box>
    );
  }

  if (showAfterEolOnly) {
    return null;
  }

  return (
    <Box className={cx(S.root, S.beforeEol)}>
      <Icon name="info" c="icon-primary" />
      <Text>{c("{0} is a date")
        .t`This version of Metabase reaches end-of-life on ${eolDate.toLocaleDateString(undefined, { timeZone: "UTC" })}.`}</Text>
      <LearnMoreLink />
    </Box>
  );
}

const LEARN_MORE_URL = "https://www.metabase.com/version-support";

function LearnMoreLink() {
  return (
    <Anchor
      component={ExternalLink}
      href={LEARN_MORE_URL}
      className={S.link}
      fw="bold"
    >
      {t`Learn more`}
    </Anchor>
  );
}
