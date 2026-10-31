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
import {
  ActionIcon,
  Group,
  FixedSizeIcon as Icon,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getUserName } from "metabase/utils/user";
import type Question from "metabase-lib/v1/Question";

import { QuestionPublicLinkPopover } from "./QuestionPublicLinkPopover/QuestionPublicLinkPopover";
import { QuestionSources } from "./components/QuestionSources";

export const QuestionDetails = ({ question }: { question: Question }) => {
  const lastEditInfo = question.lastEditInfo();
  const createdBy = question.getCreator();
  const createdAt = question.getCreatedAt();

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
          value={<SavedInValue question={question} />}
        />
        <VisibilityRow question={question} />
        <QuestionSources />
      </DetailsTable>
    </SidebarSection>
  );
};

/**
 * The dashboard for a dashboard question, else the collection. The card
 * endpoint hydrates `dashboard`, so the request only runs when that is
 * missing; if it fails, the collection still locates the question.
 */
const SavedInValue = ({ question }: { question: Question }) => {
  const dashboardId = question.dashboardId();
  const cardDashboard = question.dashboard();
  const { data: fetchedDashboard, isLoading } = useGetDashboardQuery(
    dashboardId !== null && cardDashboard === null
      ? { id: dashboardId }
      : skipToken,
  );
  const dashboard = cardDashboard ?? fetchedDashboard;

  if (dashboardId !== null && dashboard) {
    return (
      <Link to={Urls.dashboard(dashboard)} variant="brand">
        {dashboard.name}
      </Link>
    );
  }

  if (isLoading) {
    return <Loader size="xs" />;
  }

  const collection = question.collection();

  return (
    <Link to={Urls.collection(collection)} variant="brand">
      {getCollectionName(collection)}
    </Link>
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
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    c="text-primary"
                    aria-label={t`Public link`}
                    onClick={() => setIsPopoverOpen((prev) => !prev)}
                  >
                    <Icon name="link" />
                  </ActionIcon>
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
