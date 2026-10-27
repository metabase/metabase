import cx from "classnames";
import { useState } from "react";
import { c, t } from "ttag";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { getCollectionName } from "metabase/common/collections/utils";
import { DateTime } from "metabase/common/components/DateTime";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import Styles from "metabase/css/core/index.css";
import { Group, FixedSizeIcon as Icon, Loader, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getUserName } from "metabase/utils/user";
import type Question from "metabase-lib/v1/Question";

import { QuestionPublicLinkPopover } from "./QuestionPublicLinkPopover/QuestionPublicLinkPopover";
import { QuestionSources } from "./components/QuestionSources";

export const QuestionDetails = ({ question }: { question: Question }) => {
  const lastEditInfo = question.lastEditInfo();
  const createdBy = question.getCreator();
  const createdAt = question.getCreatedAt();
  const collection = question.collection();
  const dashboardId = question.dashboardId();
  const isDashboardQuestion = dashboardId !== null;

  const { data: dashboard, isLoading } = useGetDashboardQuery(
    dashboardId !== null ? { id: dashboardId } : skipToken,
  );

  return (
    <SidebarSection title={t`Details`}>
      <DetailsTable>
        <DetailsRow
          label={t`Created`}
          value={
            <Text c="text-primary">
              {c(
                "Describes when a question was created. {0} is a date/time and {1} is a person's name",
              ).jt`${(
                <DateTime unit="day" value={createdAt} key="date" />
              )} by ${getUserName(createdBy)}`}
            </Text>
          }
        />
        {lastEditInfo && (
          <DetailsRow
            label={t`Last edited`}
            value={
              <Text c="text-primary">
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
            }
          />
        )}
        <DetailsRow
          label={t`Saved in`}
          value={
            isDashboardQuestion ? (
              isLoading || !dashboard ? (
                <Loader size="xs" />
              ) : (
                <Link to={Urls.dashboard(dashboard)} variant="brand">
                  {dashboard.name}
                </Link>
              )
            ) : (
              <Link to={Urls.collection(collection)} variant="brand">
                {
                  // We need to use getCollectionName or the name of the root collection will not be displayed
                  getCollectionName(collection)
                }
              </Link>
            )
          }
        />
        <VisibilityRow question={question} />
        <QuestionSources />
      </DetailsTable>
    </SidebarSection>
  );
};

function VisibilityRow({ question }: { question: Question }) {
  const publicUUID = question.publicUUID();
  const embeddingEnabled = question._card.enable_embedding;
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  if (!publicUUID && !embeddingEnabled) {
    return null;
  }

  return (
    <DetailsRow
      label={t`Visibility`}
      value={
        <Stack gap="xs">
          {publicUUID && (
            <Group gap="sm" wrap="nowrap">
              <Text c="text-primary">{t`Shared publicly`}</Text>
              <QuestionPublicLinkPopover
                target={
                  <Icon
                    name="link"
                    onClick={() => setIsPopoverOpen((prev) => !prev)}
                    className={cx(Styles.cursorPointer, Styles.textBrandHover)}
                  />
                }
                isOpen={isPopoverOpen}
                onClose={() => setIsPopoverOpen(false)}
                question={question}
              />
            </Group>
          )}
          {embeddingEnabled && <Text c="text-primary">{t`Embedded`}</Text>}
        </Stack>
      }
    />
  );
}
