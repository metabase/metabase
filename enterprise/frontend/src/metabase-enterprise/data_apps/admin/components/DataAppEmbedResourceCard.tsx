import { t } from "ttag";

import { Alert, Button, Card, Select, Stack, Text } from "metabase/ui";
import { useListDataAppsQuery } from "metabase-enterprise/api";

export const DataAppEmbedResourceCard = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (path: string) => void;
}) => {
  const {
    data: apps = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useListDataAppsQuery();

  return (
    <Card p="lg">
      <Stack gap="lg">
        <Text size="lg" fw="bold">{t`Select a data app to embed`}</Text>
        <Select
          aria-label={t`Data app`}
          placeholder={t`Select a data app`}
          searchable
          disabled={isLoading}
          data={apps.map((app) => ({
            value: app.name,
            label: app.display_name,
          }))}
          value={value}
          onChange={(path) => {
            if (path) {
              onChange(path);
            }
          }}
          nothingFoundMessage={t`No data apps found`}
        />
        {isError && (
          <Alert color="error">
            {t`Could not load data apps`}{" "}
            <Button
              variant="subtle"
              onClick={() => refetch()}
              disabled={isFetching}
            >{t`Retry`}</Button>
          </Alert>
        )}
      </Stack>
    </Card>
  );
};
