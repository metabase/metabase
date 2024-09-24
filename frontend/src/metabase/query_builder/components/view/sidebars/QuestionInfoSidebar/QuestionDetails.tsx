import cx from "classnames";
import { type ReactNode, useState } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { getTableUrl } from "metabase/browse/containers/TableBrowser/TableBrowser";
import { getCollectionName } from "metabase/collections/utils";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import DateTime from "metabase/components/DateTime";
import Link from "metabase/core/components/Link";
import Styles from "metabase/css/core/index.css";
import { getIcon } from "metabase/lib/icon";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserName } from "metabase/lib/user";
import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import { QuestionPublicLinkPopover } from "metabase/sharing/components/PublicLinkPopover";
import {
  Box,
  Flex,
  FixedSizeIcon as Icon,
  Text,
  type TextProps,
} from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import SidebarStyles from "./QuestionInfoSidebar.module.css";

export const QuestionDetails = ({ question }: { question: Question }) => {
  const lastEditInfo = question.lastEditInfo();
  const createdBy = question.getCreator();
  const createdAt = question.getCreatedAt();
  const collection = question.collection();

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
        <SidesheetCardSection title={t`Saved in`}>
          <Flex gap="sm" align="top" color="var(--mb-color-brand)">
            <PLUGIN_COLLECTION_COMPONENTS.CollectionAuthorityLevelIcon
              collection={collection}
              className={SidebarStyles.IconMargin}
              showIconForRegularCollection
            />
            <Text>
              <Link to={Urls.collection(collection)} variant="brand">
                {
                  // We need to use getCollectionName or the name of the root collection will not be displayed
                  getCollectionName(question.collection())
                }
              </Link>
            </Text>
          </Flex>
        </SidesheetCardSection>
      )}
      <SharingDisplay question={question} />
      <SourceDisplay question={question} />
    </>
  );
};

function SourceDisplay({ question }: { question: Question }) {
  /** This might be a table or the underlying question that the presently viewed question is based on */
  const sourceInfo = question.legacyQueryTable();
  const metadata = useSelector(getMetadata);

  if (!sourceInfo) {
    return null;
  }

  const sourceModel = String(sourceInfo.id).includes("card__")
    ? "card"
    : "table";

  const sourceUrl =
    sourceModel === "card"
      ? Urls.question(sourceInfo as any) // FIXME:
      : getTableUrl(sourceInfo, metadata);

  const modelForIcon = match({
    model: sourceModel,
    type: "type" in sourceInfo ? sourceInfo.type : null,
  })
    .with({ type: "question" }, () => ({ model: "card" as const }))
    .with({ type: "model" }, () => ({ model: "dataset" as const }))
    .otherwise(() => ({ model: "table" as const }));

  const iconProps = getIcon(modelForIcon);

  return (
    <SidesheetCardSection title={t`Based on`}>
      <Flex gap="sm" align="flex-start">
        {sourceInfo.db && (
          <>
            <SourceFlex>
              <Box component={Icon} mt={3} name="database" />
              <Link to={Urls.browseDatabase(sourceInfo.db)} variant="brand">
                {sourceInfo.db.name}
              </Link>
            </SourceFlex>
            <SourceFlex>{"/"}</SourceFlex>
          </>
        )}
        <SourceFlex>
          <Box component={Icon} mt={3} {...iconProps} />
          <Link to={sourceUrl} variant="brand">
            {sourceInfo?.display_name}
          </Link>
        </SourceFlex>
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

const SourceFlex = ({
  children,
  ...props
}: { children: ReactNode } & TextProps) => (
  <Flex gap="sm" lh="1.25rem" maw="20rem" {...props}>
    {children}
  </Flex>
);
