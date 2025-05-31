import { t } from "ttag";
import { Link } from "react-router";
import cx from "classnames";
import { Box, Title, Text, SimpleGrid, Stack, Group, Icon } from "metabase/ui";
import { useListDatabasesQuery } from "metabase/api";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import * as Urls from "metabase/lib/urls";
import { newDatabase } from "metabase/lib/urls";
import { trackAddDatabaseDBList } from "metabase/browse/databases/analytics";
import { getEngineLogo } from "metabase/databases/utils/engine";
import CatalogSidebar from "./components/CatalogSidebar";
import CS from "metabase/css/core/index.css";
import slugg from "slugg";

interface DatabaseCardProps {
  children: React.ReactNode;
  [key: string]: any;
}

const DatabaseCard = ({ children, ...props }: DatabaseCardProps) => {
  return (
    <Stack h="8.5rem" justify="space-between" p="lg" {...props}>
      {children}
    </Stack>
  );
};

const CatalogPage = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = data?.data;

  if (isLoading) {
    return (
      <Box display="flex" h="100%">
        <CatalogSidebar />
        <Box p="xl" flex="1">
          <Text>{t`Loading...`}</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" h="100%">
        <CatalogSidebar />
        <Box p="xl" flex="1">
          <Text c="error">{t`Error loading databases`}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box display="flex" h="100%">
      <CatalogSidebar />
      <Box p="xl" flex="1">
        <Title order={1} mb="lg">{t`Catalog`}</Title>
        <Text c="text-medium" mb="xl">
          {t`Browse and explore your data catalog. Select a database or table from the sidebar to view its details.`}
        </Text>

        <SimpleGrid data-testid="database-browser" cols={3}>
          {databases &&
            databases.length > 0 &&
            databases.map((database) => (
              <Link 
                to={`/catalog/databases/${database.id}-${slugg(database.name)}`} 
                key={database.id}
              >
                <DatabaseCard
                  bg="bg-white"
                  className={cx(CS.rounded, CS.bordered)}
                >
                  <Icon name="database" color={color("accent2")} size={32} />
                  <Title order={2} size="md" lh={1.2} c="inherit">
                    {database.name}
                  </Title>
                </DatabaseCard>
              </Link>
            ))}

          {isAdmin && (
            <Link to={newDatabase()} onClick={() => trackAddDatabaseDBList()}>
              <DatabaseCard
                className={cx(CS.rounded, CS.bordered)}
              >
                <Group gap="xs">
                  <Box
                    bg="white"
                    h="xl"
                    w="xl"
                    className={CS.rounded}
                    style={{
                      boxShadow:
                        "0px 0px 0px 1px rgba(0, 0, 0, 0.05), 0px 1px 4px 0px rgba(0, 0, 0, 0.10)",
                    }}
                  >
                    <img src={getEngineLogo("postgres")} alt={t`PostgreSQL database logo`} />
                  </Box>
                  <Box
                    bg="white"
                    h="xl"
                    w="xl"
                    className={CS.rounded}
                    style={{
                      boxShadow:
                        "0px 0px 0px 1px rgba(0, 0, 0, 0.05), 0px 1px 4px 0px rgba(0, 0, 0, 0.10)",
                    }}
                  >
                    <img src={getEngineLogo("mysql")} alt={t`MySQL database logo`} />
                  </Box>
                  <Box
                    bg="white"
                    h="xl"
                    w="xl"
                    className={CS.rounded}
                    style={{
                      boxShadow:
                        "0px 0px 0px 1px rgba(0, 0, 0, 0.05), 0px 1px 4px 0px rgba(0, 0, 0, 0.10)",
                    }}
                  >
                    <img src={getEngineLogo("snowflake")} alt={t`Snowflake database logo`} />
                  </Box>
                </Group>
                <div>
                  <Title order={2} size="md" lh={1.2} c="inherit">
                    {t`Add a database`}
                  </Title>
                  <Text
                    color="inherit"
                    fz="sm"
                    lh={1}
                    span
                  >{t`20+ data connectors. Start exploring in minutes.`}</Text>
                </div>
              </DatabaseCard>
            </Link>
          )}
        </SimpleGrid>
      </Box>
    </Box>
  );
};

export default CatalogPage; 