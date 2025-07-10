import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { BrowseCard } from "metabase/browse/components/BrowseCard";
import {
  BrowseSection,
  CenteredEmptyState,
} from "metabase/browse/components/BrowseContainer.styled";
import { BrowseGrid } from "metabase/browse/components/BrowseGrid";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { DataApp } from "metabase/data-apps/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { uuid } from "metabase/lib/uuid";
import { addUndo } from "metabase/redux/undo";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Group, Icon, Stack, Title } from "metabase/ui";
import {
  useCreateDataAppMutation,
  useGetDataAppsQuery,
} from "metabase-enterprise/api";
import { getUpdateApiErrorMessage } from "metabase-enterprise/data-apps/utils";

export const DataAppsList = () => {
  const isAdmin = useSelector(getUserIsAdmin);

  const { data, isLoading } = useGetDataAppsQuery();
  const dataApps: DataApp[] | undefined = data?.data;

  if (!dataApps && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!dataApps?.length && !isAdmin) {
    return (
      <CenteredEmptyState
        title={<Box mb=".5rem">{t`No data apps here yet`}</Box>}
        illustrationElement={
          <Box mb=".5rem">
            <img src={NoResults} />
          </Box>
        }
      />
    );
  }

  return (
    <Stack mt="1rem">
      <Box>
        <BrowseSection>
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={2} c="text-dark">
              <Group gap="sm">
                <Icon
                  size={24}
                  color="var(--mb-color-brand)"
                  name="format_code"
                />
                {t`Data Apps`}
              </Group>
            </Title>
          </Flex>
        </BrowseSection>
      </Box>
      <Box p="0 2.5rem">
        <BrowseSection direction="column">
          <BrowseGrid data-testid="database-browser">
            {dataApps &&
              dataApps.length > 0 &&
              dataApps.map((app) => (
                <BrowseCard
                  to={Urls.dataAppEdit(app.id)}
                  key={app.id}
                  title={app.name}
                  icon="format_code"
                  size="lg"
                  iconColor="var(--mb-color-brand)"
                />
              ))}
          </BrowseGrid>
          {isAdmin && <AddAppCard />}
        </BrowseSection>
      </Box>
    </Stack>
  );
};

const AddAppCard = () => {
  const [createDataAppMutation] = useCreateDataAppMutation();

  const dispatch = useDispatch();

  const handleCreate = useCallback(async () => {
    try {
      const { data: app, error } = await createDataAppMutation({
        name: "Untitled",
        slug: uuid(),
      });

      if (app) {
        dispatch(push(Urls.dataAppEdit(app.id, { isNew: true })));
      } else {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: getUpdateApiErrorMessage(error),
          }),
        );
      }
    } catch (e) {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: getUpdateApiErrorMessage(e),
        }),
      );
    }
  }, [createDataAppMutation, dispatch]);

  return (
    <Button
      variant="outline"
      style={{
        alignSelf: "flex-start",
        marginTop: "1rem",
      }}
      onClick={handleCreate}
    >{t`Create Data App`}</Button>
  );
};
