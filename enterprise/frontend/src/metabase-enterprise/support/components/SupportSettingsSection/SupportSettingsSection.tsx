import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useDispatch } from "metabase/lib/redux";
import { adminToolsGrantAccess } from "metabase/lib/urls";
import { Box, Button, Flex, LoadingOverlay, Text, Title } from "metabase/ui";

import { useAccessGrantsQuery } from "../../hooks/useAccessGrantsQuery";

import { AccessGrantList } from "./AccessGrantList";

export function SupportSettingsSection() {
  const dispatch = useDispatch();
  const {
    accessGrants,
    accessGrantsError,
    currentAccessGrant,
    handleNextPage,
    handlePreviousPage,
    isFetchingAccessGrants,
    isLoadingAccessGrants,
    page,
    pageSize,
    total,
  } = useAccessGrantsQuery();

  return (
    <SettingsSection
      title={t`Helping hand`}
      description={
        <>
          <Text c="text-secondary" mt="sm">
            {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
            {t`Let a Metabase Success Engineer log in to your instance with a troubleshooting account to help resolve problems for you.`}
          </Text>
          <Text c="text-secondary">
            {t`Access always auto expires after the period you select.`}
          </Text>
        </>
      }
      stackProps={{ gap: 0 }}
    >
      <LoadingAndErrorWrapper
        error={accessGrantsError}
        loading={isLoadingAccessGrants}
      >
        <Box pb="lg">
          <Button
            disabled={!!currentAccessGrant}
            onClick={() => dispatch(push(adminToolsGrantAccess()))}
            variant="filled"
            title={
              currentAccessGrant
                ? t`You already have an active access grant`
                : undefined
            }
            mt="md"
            mb="sm"
          >
            {t`Request a helping hand`}
          </Button>
          <Text size="sm" c="text-secondary">
            {t`You can only have one active request at a time`}
          </Text>

          {accessGrants.length > 0 && (
            <Box pos="relative">
              <LoadingOverlay
                visible={isFetchingAccessGrants}
                zIndex={1000}
                overlayProps={{ radius: "sm", blur: 0.25 }}
              />
              <Title lh="2.5rem" order={4} pt="lg">
                {t`History`}
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
  );
}
