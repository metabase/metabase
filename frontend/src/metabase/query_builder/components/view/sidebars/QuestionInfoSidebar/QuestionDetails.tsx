import { useState } from "react";
import { c, t } from "ttag";

import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import DateTime from "metabase/components/DateTime";
import Styles from "metabase/css/core/cursor.module.css";
import { getUserName } from "metabase/lib/user";
import { QuestionPublicLinkPopover } from "metabase/sharing/components/PublicLinkPopover";
import { Flex, Icon, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

export const QuestionDetails = ({ question }: { question: Question }) => {
  const lastEditInfo = question.lastEditInfo();
  const createdBy = question.getCreator();
  const createdAt = question.getCreatedAt();

  return (
    <>
      <SidesheetCardSection title={t`Creator and last editor`}>
        {lastEditInfo && (
          <Flex gap="sm" align="center">
            <Icon name="ai" />
            <Text>
              {c("{0} is a date/time and ${1} is a person's name").jt`${(
                <DateTime
                  unit="day"
                  value={lastEditInfo.timestamp}
                  key="date"
                />
              )} by ${getUserName(lastEditInfo)}`}
            </Text>
          </Flex>
        )}

        <Flex gap="sm" align="center">
          <Icon name="pencil" />
          <Text>
            {c("{0} is a date/time and ${1} is a person's name").jt`${(
              <DateTime unit="day" value={createdAt} key="date" />
            )} by ${getUserName(createdBy)}`}
          </Text>
        </Flex>
      </SidesheetCardSection>
      <SidesheetCardSection title={t`Saved in`}>
        <Flex gap="sm" align="center">
          <Icon name="folder" />
          <Text>{question.collection()?.name}</Text>
        </Flex>
      </SidesheetCardSection>
      <SharingDisplay question={question} />
      <SourceDisplay question={question} />
    </>
  );
};

function SourceDisplay({ question }: { question: Question }) {
  const sourceInfo = question.legacyQueryTable();

  if (!sourceInfo) {
    return null;
  }

  return (
    <SidesheetCardSection title={t`Based on`}>
      <Flex gap="sm" align="center">
        {sourceInfo.db && (
          <>
            <Text>{sourceInfo.db.name}</Text>
            {"/"}
          </>
        )}
        <Text>{sourceInfo?.display_name}</Text>
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
          <Icon name="share" color="var(--mb-color-brand)" />
          <Text>{t`Shared publicly`}</Text>

          <QuestionPublicLinkPopover
            target={
              <Icon
                name="link"
                onClick={() => setIsPopoverOpen(prev => !prev)}
                className={Styles.cursorPointer}
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
          <Icon name="embed" color="var(--mb-color-brand)" />
          <Text>{t`Embedding enabled`}</Text>
        </Flex>
      )}
    </SidesheetCardSection>
  );
}
