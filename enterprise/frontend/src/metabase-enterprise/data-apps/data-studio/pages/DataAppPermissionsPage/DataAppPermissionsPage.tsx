import { useDisclosure, useElementSize } from "@mantine/hooks";
import { useState } from "react";
import { jt, t } from "ttag";

import { skipToken } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Alert, Button, Center, Flex, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetDataAppGroupsQuery } from "metabase-enterprise/api";
import type { GroupId } from "metabase-types/api";

import { DataAppHeader } from "../../components/DataAppHeader";
import { useRouteDataApp } from "../../hooks/use-route-data-app";

import { AddDataAppGroupsModal } from "./AddDataAppGroupsModal";
import { DataAppGroupList } from "./DataAppGroupList";
import { DataAppGroupSidebar } from "./DataAppGroupSidebar";

export function DataAppPermissionsPage() {
  const { app, isLoading, error } = useRouteDataApp();
  const [isAdding, { open: openAdding, close: closeAdding }] =
    useDisclosure(false);
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure(false);
  const [selectedGroupId, setSelectedGroupId] = useState<GroupId>();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const { data: groups } = useGetDataAppGroupsQuery(app?.slug ?? skipToken);
  const selectedGroup = groups?.find((group) => group.id === selectedGroupId);

  if (isLoading || error != null || app == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Flex
      ref={containerRef}
      h="100%"
      wrap="nowrap"
      style={isResizing ? { userSelect: "none" } : undefined}
    >
      <PageContainer
        data-testid="data-app-permissions"
        gap="lg"
        flex={1}
        miw={0}
      >
        <DataAppHeader app={app} />
        {app.allowed_hosts.length > 0 && (
          <Alert variant="light" icon={<Icon name="info" />}>
            {jt`This app can connect to external hosts, listed on its ${(
              <Link
                key="overview"
                variant="brand"
                to={Urls.dataStudioDataApp(app.slug)}
              >
                {t`Overview page`}
              </Link>
            )}. Permissions don't apply to data from those hosts: anyone who can open the app can see it.`}
          </Alert>
        )}
        <Stack style={{ overflow: "hidden" }}>
          <Flex justify="flex-end">
            <Button variant="filled" onClick={openAdding}>
              {t`Add groups`}
            </Button>
          </Flex>
          <DataAppGroupList
            app={app}
            selectedGroupId={selectedGroup?.id}
            onSelectGroup={setSelectedGroupId}
          />
        </Stack>
        {isAdding && <AddDataAppGroupsModal app={app} onClose={closeAdding} />}
      </PageContainer>
      {selectedGroup != null && (
        <DataAppGroupSidebar
          app={app}
          group={selectedGroup}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedGroupId(undefined)}
        />
      )}
    </Flex>
  );
}
