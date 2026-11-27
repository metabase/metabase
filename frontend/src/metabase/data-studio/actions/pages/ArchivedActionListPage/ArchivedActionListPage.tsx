import { useCallback, useState } from "react";
import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Card, Center, Icon, Stack, TextInput } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useBuildActionTree } from "../../hooks/use-build-action-tree";

import { ArchivedActionTable } from "./ArchivedActionTable";

export function ArchivedActionListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { tree, isLoading, error } = useBuildActionTree({ archived: true });
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const [updateAction] = useUpdateActionMutation();
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const handleUnarchive = useCallback(
    async ({ id, name }: { id: number; name: string }) => {
      try {
        await updateAction({ id, archived: false }).unwrap();
        sendSuccessToast(t`"${name}" unarchived`);
      } catch (error) {
        sendErrorToast(getErrorMessage(error, t`Failed to unarchive action`));
      }
    },
    [sendErrorToast, sendSuccessToast, updateAction],
  );

  if (isLoading || error) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SectionLayout>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link to={Urls.dataStudioActions()}>{t`Data actions`}</Link>
            {t`Archived actions`}
          </DataStudioBreadcrumbs>
        }
        px="3.5rem"
        py={0}
      />
      <Stack
        bg="background_page-secondary"
        data-testid="archived-actions-page"
        pb="2rem"
        px="3.5rem"
        style={{ overflow: "hidden" }}
      >
        <TextInput
          placeholder={t`Search...`}
          leftSection={<Icon name="search" />}
          bdrs="sm"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <Card withBorder p={0}>
          <ArchivedActionTable
            tree={tree}
            searchQuery={searchQuery}
            readOnly={remoteSyncReadOnly}
            onSearchQueryChange={setSearchQuery}
            onUnarchive={handleUnarchive}
          />
        </Card>
      </Stack>
    </SectionLayout>
  );
}
