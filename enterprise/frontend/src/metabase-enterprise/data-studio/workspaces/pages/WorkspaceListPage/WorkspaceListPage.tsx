import { useEffect, useMemo } from "react";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Text, Title } from "metabase/ui";
import { useGetWorkspacesQuery } from "metabase-enterprise/api";

export function WorkspaceListPage() {
  const dispatch = useDispatch();
  const { data: workspacesData, error, isFetching } = useGetWorkspacesQuery();

  const workspaces = useMemo(
    () => workspacesData?.items ?? [],
    [workspacesData],
  );

  const firstWorkspaceId = workspaces[0]?.id;

  useEffect(() => {
    if (error || firstWorkspaceId == null) {
      return;
    }

    dispatch(replace(Urls.dataStudioWorkspace(firstWorkspaceId)));
  }, [dispatch, error, firstWorkspaceId]);

  if (error) {
    return <LoadingAndErrorWrapper error={error} loading={false} />;
  }

  if (firstWorkspaceId != null) {
    return null;
  }

  if (isFetching) {
    return <LoadingAndErrorWrapper error={error} loading={isFetching} />;
  }

  return (
    <Box data-testid="workspaces-page" p="lg">
      <Title size="lg">{t`No active workspaces`}</Title>
      <Text c="text-secondary">
        {t`Create a new one from the left panel or by editing an existing transform.`}
      </Text>
    </Box>
  );
}
