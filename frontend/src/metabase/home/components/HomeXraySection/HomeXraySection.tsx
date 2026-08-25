import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useListDatabaseXraysQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Box,
  Combobox,
  DefaultSelectItem,
  Flex,
  Icon,
  Text,
  UnstyledButton,
  useCombobox,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isSyncCompleted } from "metabase/utils/syncing";
import { isNotNull } from "metabase/utils/types";
import type { Database, DatabaseXray } from "metabase-types/api";

import { HomeCaption } from "../HomeCaption";
import { HomeHelpCard } from "../HomeHelpCard";
import { HomeXrayCard } from "../HomeXrayCard";

export const HomeXraySection = () => {
  const {
    data: databasesData,
    isLoading: databasesLoading,
    error: databasesError,
  } = useListDatabasesQuery();

  const database = getXrayDatabase(databasesData?.data);
  const candidateListState = useListDatabaseXraysQuery(
    database?.id ?? skipToken,
  );
  const isLoading = databasesLoading || candidateListState.isLoading;
  const error = databasesError ?? candidateListState.error;

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!database) {
    return null;
  }

  return (
    <HomeXrayView database={database} candidates={candidateListState.data} />
  );
};

interface HomeXrayViewProps {
  database: Database;
  candidates?: DatabaseXray[];
}

const HomeXrayView = ({ database, candidates = [] }: HomeXrayViewProps) => {
  const isSample = database.is_sample;
  const schemas = candidates.map((d) => d.schema);
  const [schema, setSchema] = useState(getDefaultSchema(schemas));
  const candidate = candidates.find((d) => d.schema === schema);
  const tableCount = candidate ? candidate.tables.length : 0;
  const tableMessages = useMemo(() => getMessages(tableCount), [tableCount]);
  const canSelectSchema = schemas.length > 1 && schema !== null;
  const applicationName = useSelector(getApplicationName);
  const hasTables = (candidate?.tables.length ?? 0) > 0;

  return (
    <Box>
      {isSample ? (
        <HomeCaption primary>
          {t`Try out these sample x-rays to see what ${applicationName} can do.`}
        </HomeCaption>
      ) : canSelectSchema ? (
        <HomeCaption primary>
          {t`Here are some explorations of the`}
          <SchemaSelect
            schema={schema}
            schemas={schemas}
            onChange={setSchema}
          />
          {t`schema in`}
          <DatabaseInfo database={database} />
        </HomeCaption>
      ) : hasTables ? (
        <HomeCaption primary>
          {t`Here are some explorations of`}
          <DatabaseInfo database={database} />
        </HomeCaption>
      ) : null}
      <Flex gap="lg" wrap="wrap">
        {candidate?.tables.map((table, index) => (
          <HomeXrayCard
            key={table.url}
            title={table.title}
            url={table.url}
            message={tableMessages[index]}
          />
        ))}
        <HomeHelpCard />
      </Flex>
    </Box>
  );
};

const getDefaultSchema = (schemas: Array<string | null>) => {
  return (
    schemas
      .filter(isNotNull)
      .find((schema) => schema.toLowerCase() === "public") || schemas[0]
  );
};

interface SchemaSelectProps {
  schema: string;
  schemas: string[];
  onChange?: (schema: string) => void;
}

const SchemaSelect = ({ schema, schemas, onChange }: SchemaSelectProps) => {
  const combobox = useCombobox();

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      width={300}
      onOptionSubmit={(value) => {
        onChange?.(value);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <Flex
          component={UnstyledButton}
          align="center"
          display="inline-flex"
          mx="sm"
          onClick={() => combobox.toggleDropdown()}
        >
          <Text
            component="span"
            c="core-brand"
            fw="bold"
            data-testid="xray-schema-name"
          >
            {schema}
          </Text>
          <Icon name="chevrondown" c="core-brand" size={10} ml="xs" />
        </Flex>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {schemas.map((schemaOption) => (
            <Combobox.Option
              key={schemaOption}
              value={schemaOption}
              selected={schemaOption === schema}
              p={0}
            >
              <DefaultSelectItem
                value={schemaOption}
                selected={schemaOption === schema}
              />
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};

interface DatabaseInfoProps {
  database: Database;
}

const DatabaseInfo = ({ database }: DatabaseInfoProps) => {
  return (
    <Flex
      component={Link}
      to={Urls.browseDatabase(database)}
      align="center"
      ml="sm"
    >
      <Icon
        name="database"
        c="input-focus"
        size="var(--mantine-spacing-md)"
        mr="xs"
      />
      <Text component="span" c="core-brand" fw="bold">
        {database.name}
      </Text>
    </Flex>
  );
};

const getXrayDatabase = (databases: Database[] | undefined = []) => {
  const sampleDatabase = databases.find(
    (d) => d.is_sample && isSyncCompleted(d),
  );
  const userDatabase = databases.find(
    (d) => !d.is_sample && isSyncCompleted(d),
  );
  return userDatabase ?? sampleDatabase;
};

const getMessages = (count: number) => {
  const options = [
    t`A look at`,
    t`A summary of`,
    t`A glance at`,
    t`Some insights about`,
  ];

  return _.chain(count)
    .range()
    .map((index) => options[index % options.length])
    .sample(count)
    .value();
};
