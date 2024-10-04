import cx from "classnames";
import { useState } from "react";
import { c, t } from "ttag";
import { getCollectionName } from "metabase/collections/utils";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import DateTime from "metabase/components/DateTime";
import Link from "metabase/core/components/Link";
import Styles from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { QuestionPublicLinkPopover } from "metabase/sharing/components/PublicLinkPopover";
import { Box, Flex, FixedSizeIcon as Icon, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import { QuestionSources } from "./components/QuestionSources";
import SidebarStyles from "./QuestionInfoSidebar.module.css";

export const QuestionDetails = ({ question }: { question: Question }) => {
  const lastEditInfo = question.lastEditInfo();
  const createdBy = question.getCreator();
  const createdAt = question.getCreatedAt();
  const collection = question.collection();

  const collectionSectionTitle = c(
    "This is a heading that appears above the name of a collection - a collection that a dashboard is saved in. Feel free to translate this heading as though it said 'Saved in collection', if you think that would make more sense in your language.",
  ).t`Saved in`;

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
      {collection && (
        <SidesheetCardSection title={collectionSectionTitle}>
          <Flex gap="sm" align="top" color="var(--mb-color-brand)">
            <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
              collection={collection}
              className={SidebarStyles.IconMargin}
            />
            <Text>
              <Link to={Urls.collection(collection)} variant="brand">
                {
                  // We need to use getCollectionName or the name of the root collection will not be displayed
                  getCollectionName(collection)
                }
              </Link>
            </Text>
          </Flex>
        </SidesheetCardSection>
      )}
      <SharingDisplay question={question} />
      <QuestionSources question={question} />
    </>
  );
};

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
