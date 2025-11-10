import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  Alert,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  LoadingOverlay,
  Text,
  Title,
} from "metabase/ui";
import { useGetCurrentSupportAccessGrantQuery } from "metabase-enterprise/api";

import { AccessGrantList } from "./components/AccessGrantList";
import { GrantAccessModal } from "./components/GrantAccessModal";
import { useAccessGrantsQuery } from "./hooks/useAccessGrantsQuery";

export function SupportSettingsPage() {
  const { data: currentAccessGrant } = useGetCurrentSupportAccessGrantQuery();
  const {
    accessGrants,
    accessGrantsError,
    handleNextPage,
    handlePreviousPage,
    isFetchingAccessGrants,
    isLoadingAccessGrants,
    page,
    pageSize,
    total,
  } = useAccessGrantsQuery();
  const [showCreateGrantModal, { toggle: toggleCreateGrantModal }] =
    useDisclosure(false);
  const showHistory =
    accessGrants.length > 1 ||
    (accessGrants.length === 1 && !currentAccessGrant);

  return (
    <SettingsPageWrapper title={t`Support`}>
      <SettingsSection>
        <LoadingAndErrorWrapper
          error={accessGrantsError}
          loading={isLoadingAccessGrants}
        >
          <Box pb="lg">
            <Group justify="space-between" mb="md">
              <Title order={4} lh="2.5rem">{t`Current Access Grant`}</Title>
              {!currentAccessGrant && (
                <Button variant="filled" onClick={toggleCreateGrantModal}>
                  {t`New access grant`}
                </Button>
              )}
            </Group>
            {currentAccessGrant ? (
              <AccessGrantList accessGrants={[currentAccessGrant]} active />
            ) : (
              <Alert icon={<Icon name="info" />} variant="light" color="info">
                <Text>{t`No active access grants.`}</Text>
              </Alert>
            )}

            {showHistory && (
              <Box pos="relative">
                <LoadingOverlay
                  visible={isFetchingAccessGrants}
                  zIndex={1000}
                  overlayProps={{ radius: "sm", blur: 0.25 }}
                />
                <Title lh="2.5rem" mb="md" mt="lg" order={4} pt="lg">
                  {t`Access Grant History`}
                </Title>
                <AccessGrantList accessGrants={accessGrants} />
                <Flex justify="flex-end" mt="sm">
                  <PaginationControls
                    itemsLength={accessGrants.length}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    showTotal
                  />
                </Flex>
              </Box>
            )}
          </Box>
        </LoadingAndErrorWrapper>
      </SettingsSection>
      {showCreateGrantModal && (
        <GrantAccessModal onClose={toggleCreateGrantModal} />
      )}
    </SettingsPageWrapper>
  );
}
