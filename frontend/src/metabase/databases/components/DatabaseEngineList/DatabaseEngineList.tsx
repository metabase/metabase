import { useCallback, useState } from "react";
import { t } from "ttag";

import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useSetting } from "metabase/common/hooks";
import { MAX_INITIAL_ENGINES_SHOWN } from "metabase/databases/constants";
import { getEngines } from "metabase/databases/selectors";
import {
  getEngineLogo,
  getEngineOptions,
} from "metabase/databases/utils/engine";
import { useSelector } from "metabase/lib/redux";
import {
  Button,
  Center,
  Combobox,
  Flex,
  Group,
  Icon,
  ScrollArea,
  Stack,
  Text,
  useCombobox,
} from "metabase/ui";

import S from "./DatabaseEngineList.module.css";

type DatabaseEngineListProps =
  | {
      isSetupStep: true;
      showSampleDatabase?: boolean;
      engineKey?: string;
      onSelect: (engineKey?: string) => void;
    }
  | {
      isSetupStep?: never;
      engineKey?: never;
      onSelect: (engineKey: string) => void;
      showSampleDatabase?: never;
    };

export const DatabaseEngineList = ({
  onSelect,
  isSetupStep,
  engineKey,
  showSampleDatabase = false,
}: DatabaseEngineListProps) => {
  const combobox = useCombobox();
  const [search, setSearch] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const engines = useSelector(getEngines);
  const options = getEngineOptions(engines);

  const elevatedEngines = options.slice(0, MAX_INITIAL_ENGINES_SHOWN);
  const searchResults = options.filter(({ name }) =>
    name.toLowerCase().includes(search.toLowerCase().trim()),
  );

  const databasesList = isExpanded ? searchResults : elevatedEngines;

  const sampleDatabaseIndicatorVisible = showSampleDatabase && !engineKey;

  const clearSelectedItem = useCallback(() => {
    if (isSetupStep) {
      onSelect(undefined);
    }
  }, [onSelect, isSetupStep]);

  // This is just a temporary way to show a selected item. The plan is to redesign
  // this particular bit, and it will live outside this component.
  if (isSetupStep && engineKey) {
    const selected = options.find((option) => option.value === engineKey);
    return (
      <Button
        aria-label={t`Remove database`}
        fullWidth
        justify="space-between"
        mb="lg"
        onClick={clearSelectedItem}
        rightSection={<Icon name="close" />}
        variant="filled"
      >
        {selected?.name ?? engineKey}
      </Button>
    );
  }

  return (
    <Stack gap="lg" h="100%">
      <Combobox
        store={combobox}
        classNames={{
          search: S.search,
          options: S.options,
          option: S.option,
        }}
      >
        <Combobox.Search
          placeholder={t`Search databases`}
          leftSection={<Icon name="search" />}
          value={search}
          onChange={(event) => {
            const searchTerm = event.currentTarget.value;
            setSearch(searchTerm);
            setIsExpanded(searchTerm.length > 0);
          }}
        />

        {databasesList.length > 0 ? (
          <ScrollArea type="hover" scrollHideDelay={300}>
            {sampleDatabaseIndicatorVisible && <SampleDatabaseIndicator />}
            <Combobox.Options>
              {databasesList.map(({ value: engineKey, name }) => {
                return (
                  <Combobox.Option
                    key={engineKey}
                    value={engineKey}
                    onClick={() => onSelect(engineKey)}
                  >
                    <Group gap="sm">
                      <DatabaseLogo db={engineKey} />
                      <span>{name}</span>
                    </Group>
                  </Combobox.Option>
                );
              })}
            </Combobox.Options>

            <ListToggle
              aria-expanded={isExpanded}
              isExpanded={isExpanded}
              onClick={() => {
                if (isExpanded) {
                  setSearch("");
                }

                setIsExpanded(!isExpanded);
              }}
            />
          </ScrollArea>
        ) : (
          <NoDatabaseFound isSetupStep={isSetupStep} />
        )}
      </Combobox>
    </Stack>
  );
};

const DatabaseLogo = ({ db }: { db: string }) => {
  const logo = getEngineLogo(db);

  return (
    <Center h="lg" w="lg">
      {logo ? (
        <img src={logo} width="100%" />
      ) : (
        <Icon name="database" c="brand" />
      )}
    </Center>
  );
};

const NoDatabaseFound = ({ isSetupStep }: { isSetupStep?: boolean }) => {
  // Intentionally left a bit of a duplication because this is likely a temporary UX hotfix until we find a permanent
  // solution for the setup flow based on whether or not they have storage.
  const text = isSetupStep
    ? t`Sorry, we couldn't find this data source.`
    : t`Sorry, we couldn't find this data source. Try uploading your data in the CSV format instead.`;

  return (
    <Stack
      gap="md"
      align="center"
      pt="lg"
      maw="22.5rem"
      c="text-secondary"
      m="0 auto"
    >
      <Center className={S.noResultsIcon} w="3rem" h="3rem">
        <Icon name="database" c="inherit" />
      </Center>
      <Text ta="center" c="inherit">
        {text}
      </Text>
    </Stack>
  );
};

const ListToggle = ({
  isExpanded,
  onClick,
}: {
  isExpanded: boolean;
  onClick: () => void;
}) => {
  const icon = isExpanded ? "chevronup" : "chevrondown";

  return (
    <Button
      leftSection={<Icon name={icon} size={12} />}
      variant="subtle"
      onClick={onClick}
    >
      {isExpanded ? t`Hide` : t`Show more`}
    </Button>
  );
};

const SampleDatabaseIndicator = () => {
  const hasSampleDatabase = useSetting("has-sample-database?");

  // This only ever applies to the setup step where we don't have the info about databases yet.
  // Unless someone explicitly starts Metabase with env `MB_LOAD_SAMPLE_CONTENT` set to false,
  // we will include the Sample Database.
  if (hasSampleDatabase === false) {
    return;
  }

  return (
    <Flex
      align="center"
      justify="space-between"
      className={S.sampleDbIndicator}
    >
      <Flex align="center">
        <LogoIcon height={20} width={24} />
        <Text ml="sm" mr="xs">
          {t`Sample Database for testing`}
        </Text>
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- only shown to admins during setup */}
        <Text inline c="text-tertiary">{t`(by Metabase)`}</Text>
      </Flex>
      <Group gap="xs">
        <Icon name="check_filled" c="success" />
        {t`Included`}
      </Group>
    </Flex>
  );
};
