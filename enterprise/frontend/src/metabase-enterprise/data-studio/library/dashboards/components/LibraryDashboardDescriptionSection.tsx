import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateDashboardMutation } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { EditableText } from "metabase/common/components/EditableText";
import { useMetadataToasts } from "metabase/common/hooks";
import { UserInput } from "metabase/metadata/components";
import {
  Box,
  Card,
  Flex,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Dashboard, UserId } from "metabase-types/api";

import S from "./LibraryDashboardOverview.module.css";
import { useDashboardOwner } from "./use-dashboard-owner";
import {
  useAverageLoadingTime,
  useCachingLabel,
} from "./use-dashboard-performance";

type LibraryDashboardDescriptionSectionProps = {
  dashboard: Dashboard;
};

export function LibraryDashboardDescriptionSection({
  dashboard,
}: LibraryDashboardDescriptionSectionProps) {
  const [updateDashboard] = useUpdateDashboardMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [owner, setOwner] = useDashboardOwner(dashboard);
  const isOwnerSpecified = owner.userId != null || owner.email != null;

  const handleOwnerUserIdChange = (userId: UserId | "unknown" | null) => {
    if (userId == null) {
      return; // the input isn't clearable
    }
    setOwner({ userId: userId === "unknown" ? null : userId, email: null });
  };

  const handleOwnerEmailChange = (email: string) => {
    setOwner({ userId: null, email });
  };

  const handleDescriptionChange = async (newValue: string) => {
    const description = newValue.trim();
    const { error } = await updateDashboard({
      id: dashboard.id,
      description: description.length > 0 ? description : null,
    });
    if (error) {
      sendErrorToast(t`Failed to update dashboard description`);
    } else {
      sendSuccessToast(t`Dashboard description updated`);
    }
  };

  const lastEditInfo = dashboard["last-edit-info"];
  const averageLoadingTime = useAverageLoadingTime(dashboard);
  const cachingLabel = useCachingLabel(dashboard);
  const tabCount = dashboard.tabs?.length ?? 0;

  return (
    <Stack gap={0} align="stretch" data-testid="dashboard-description-sidebar">
      <Box p={rem(20)}>
        <EditableText
          initialValue={dashboard.description ?? ""}
          placeholder={t`No description`}
          isMarkdown
          isOptional
          isMultiline
          isDisabled={!dashboard.can_write}
          onChange={handleDescriptionChange}
        />
      </Box>

      <Card
        mx="xl"
        mt="xl"
        bg="background_page-secondary"
        shadow="none"
        radius="1rem"
      >
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4}>
            <Icon name="pencil" c="core-brand" />
            <Text size="md" fw={600} lh="1rem">
              <DateTime
                value={lastEditInfo?.timestamp ?? dashboard.updated_at}
              />
            </Text>
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {lastEditInfo
              ? t`Last edited by ${getUserName(lastEditInfo)}`
              : t`Last edited at`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4} wrap="nowrap">
            <Icon
              name="person"
              c={isOwnerSpecified ? "core-brand" : "icon-disabled"}
            />
            <UserInput
              email={owner.email}
              userId={isOwnerSpecified ? owner.userId : "unknown"}
              disabled={!dashboard.can_write}
              unknownUserLabel={t`No owner`}
              onUserIdChange={handleOwnerUserIdChange}
              onEmailChange={handleOwnerEmailChange}
              classNames={{
                root: S.ownerInputRoot,
                input: cx(
                  S.ownerInput,
                  isOwnerSpecified && S.ownerInputSelected,
                ),
                section: S.ownerInputSection,
              }}
            />
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Owner`}
          </Text>
        </Card.Section>
      </Card>

      <Card mx="xl" my="xl" shadow="none">
        <Statistic
          label={t`Avg loading time (s)`}
          value={
            averageLoadingTime === undefined ? (
              <Loader size="xs" />
            ) : (
              (averageLoadingTime?.toFixed(1) ?? "—")
            )
          }
        />
        <Statistic label={t`Caching policy`} value={cachingLabel ?? "—"} />
        <Statistic
          label={t`Auto-apply filters`}
          value={dashboard.auto_apply_filters ? t`On` : t`Off`}
        />
        {tabCount > 1 && <Statistic label={t`Tabs`} value={tabCount} />}
      </Card>
    </Stack>
  );
}

function Statistic({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card.Section withBorder py={rem(12)} px="lg">
      <Flex justify="space-between" align="center" gap="md">
        <Text size="md" c="text-secondary">
          {label}
        </Text>
        <Text size="md" fw={600} ta="right">
          {value}
        </Text>
      </Flex>
    </Card.Section>
  );
}
