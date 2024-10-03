import cx from "classnames";
import { useState } from "react";
import { c, t } from "ttag";

import { getTableUrl } from "metabase/browse/containers/TableBrowser/TableBrowser";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import DateTime from "metabase/components/DateTime";
import Link from "metabase/core/components/Link";
import Styles from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import { getMetadata } from "metabase/selectors/metadata";
import { QuestionPublicLinkPopover } from "metabase/sharing/components/PublicLinkPopover";
import { Box, Flex, FixedSizeIcon as Icon, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Database } from "metabase-types/api";

import SidebarStyles from "./QuestionInfoSidebar.module.css";

export const QuestionDetails = ({ question }: { question: Question }) => {
  const lastEditInfo = question.lastEditInfo();
  const createdBy = question.getCreator();
  const createdAt = question.getCreatedAt();

  return (
    <>
      <SidesheetCardSection title={t`Creator and last editor`}>
        <Flex gap="sm" align="top">
          <Icon name="ai" className={SidebarStyles.IconMargin} />
          <Text>
            {c(
              "Describes when a question was created. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={createdAt} key="date" />
            )} by ${getUserName(createdBy)}`}
          </Text>
        </Flex>

        {lastEditInfo && (
          <Flex gap="sm" align="top">
            <Icon name="pencil" className={SidebarStyles.IconMargin} />
            <Text>
              {c(
                "Describes when a question was last edited. {0} is a date/time and {1} is a person's name",
              ).jt`${(
                <DateTime
                  unit="day"
                  value={lastEditInfo.timestamp}
                  key="date"
                />
              )} by ${getUserName(lastEditInfo)}`}
            </Text>
          </Flex>
        )}
      </SidesheetCardSection>
      <SidesheetCardSection title={t`Saved in`}>
        <Flex gap="sm" align="top" color="var(--mb-color-brand)">
          <Icon
            name="folder"
            color="var(--mb-color-brand)"
            className={SidebarStyles.IconMargin}
          />
          <Text>
            <Link
              to={`/collection/${question.collection()?.id}`}
              variant="brand"
            >
              {question.collection()?.name}
            </Link>
          </Text>
        </Flex>
      </SidesheetCardSection>
      <SharingDisplay question={question} />
      <SourceDisplay question={question} />
    </>
  );
};

function SourceDisplay({ question }: { question: Question }) {
  const sourceInfo = question.legacyQueryTable();
  const metadata = useSelector(getMetadata);

  if (!sourceInfo) {
    return null;
  }

  const model = String(sourceInfo.id).includes("card__") ? "card" : "table";

  const sourceUrl =
    model === "card"
      ? Urls.browseDatabase(sourceInfo.db as Database)
      : getTableUrl(sourceInfo, metadata);

  return (
    <SidesheetCardSection title={t`Based on`}>
      <Flex gap="sm" align="center">
        {sourceInfo.db && (
          <>
            <Text>
              <Link
                to={`/browse/databases/${sourceInfo.db.id}`}
                variant="brand"
              >
                {sourceInfo.db.name}
              </Link>
            </Text>
            {"/"}
          </>
        )}
        <Text>
          <Link to={sourceUrl} variant="brand">
            {sourceInfo?.display_name}
          </Link>
        </Text>
      </Flex>
    </SidesheetCardSection>
  );
}

function SharingDisplay({ question }: { question: Question }) {
  const publicUUID = question.publicUUID();
  const embeddingEnabled = question._card.enable_embedding;
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  if (!publicUUID && !embeddingEnabled) {
    return null;
  }

  return (
    <SidesheetCardSection title={t`Visibility`}>
      {publicUUID && (
        <Flex gap="sm" align="center">
          <Icon name="globe" color="var(--mb-color-brand)" />
          <Text>{t`Shared publicly`}</Text>

          <QuestionPublicLinkPopover
            target={
              <Icon
                name="link"
                onClick={() => setIsPopoverOpen(prev => !prev)}
                className={cx(
                  Styles.cursorPointer,
                  Styles.textBrandHover,
                  SidebarStyles.IconMargin,
                )}
              />
            }
            isOpen={isPopoverOpen}
            onClose={() => setIsPopoverOpen(false)}
            question={question}
          />
        </Flex>
      )}
      {embeddingEnabled && (
        <Flex gap="sm" align="center">
          <Box className={SidebarStyles.BrandCircle}>
            <Icon name="embed" size="14px" />
          </Box>
          <Text>{t`Embedded`}</Text>
        </Flex>
      )}
    </SidesheetCardSection>
  );
}
