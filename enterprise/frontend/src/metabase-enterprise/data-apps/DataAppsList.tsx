import { Link } from "react-router";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { BrowseCard } from "metabase/browse/components/BrowseCard";
import {
  BrowseSection,
  CenteredEmptyState,
} from "metabase/browse/components/BrowseContainer.styled";
import { BrowseGrid } from "metabase/browse/components/BrowseGrid";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Group, Icon, Stack, Title } from "metabase/ui";

const DataAppsListMock = [
  {
    id: 1,
    slug: "super-app",
    name: "Super App",
  },
];

export const DataAppsList = () => {
  const isAdmin = useSelector(getUserIsAdmin);

  const dataApps = DataAppsListMock;
  const isLoading = false;

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
                  to={`/data-apps/${app.slug}`}
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

const AddAppCard = () => (
  <Link to="/data-apps/new">
    <Button
      variant="outline"
      style={{
        alignSelf: "flex-start",
        marginTop: "1rem",
      }}
    >{t`Create Data App`}</Button>
  </Link>
);
