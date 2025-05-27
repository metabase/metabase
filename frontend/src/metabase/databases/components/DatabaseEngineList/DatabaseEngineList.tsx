import { useState } from "react";
import { t } from "ttag";

import { getEngines } from "metabase/databases/selectors";
import {
  getEngineLogo,
  getEngineOptions,
} from "metabase/databases/utils/engine";
import { useSelector } from "metabase/lib/redux";
import {
  // Box,
  Button,
  Center,
  Combobox,
  Group,
  Icon,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  useCombobox,
} from "metabase/ui";

import S from "./DatabaseEngineList.module.css";

export const DatabaseEngineList = ({
  onSelect,
}: {
  onSelect: (engineKey: string) => void;
}) => {
  const combobox = useCombobox();
  const [search, setSearch] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const engines = useSelector(getEngines);
  const options = getEngineOptions(engines);

  const elevatedEngines = options.slice(0, 6);
  const searchResults = options.filter(({ value }) =>
    value.toLowerCase().includes(search.toLowerCase().trim()),
  );

  const databasesList = isExpanded ? searchResults : elevatedEngines;

  return (
    <Stack gap="lg" h="100%">
      <Combobox store={combobox}>
        <Combobox.EventsTarget>
          <TextInput
            placeholder={t`Search databases`}
            leftSection={<Icon name="search" />}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              combobox.updateSelectedOptionIndex();
            }}
            disabled={!isExpanded}
          />
        </Combobox.EventsTarget>

        {databasesList.length > 0 ? (
          <ScrollArea type="hover" scrollHideDelay={300}>
            <Combobox.Options className={S.dbList}>
              {databasesList.map(({ value: engineKey, name }) => {
                return (
                  <li key={engineKey} onClick={() => onSelect(engineKey)}>
                    <Group gap="sm">
                      <DatabaseLogo db={engineKey} />
                      <span>{name}</span>
                    </Group>
                  </li>
                );
              })}
            </Combobox.Options>

            <ListToggle
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
          <NoDatabaseFound />
        )}
      </Combobox>
    </Stack>
  );
};

const DatabaseLogo = ({ db }: { db: string }) => {
  const logo = getEngineLogo(db);

  return (
    <Center h="1.5rem" w="1.5rem">
      {logo ? (
        <img src={logo} width="100%" />
      ) : (
        <Icon name="database" c="brand" />
      )}
    </Center>
  );
};

const NoDatabaseFound = () => {
  return (
    <Stack
      gap="0.75rem"
      align="center"
      pt="lg"
      maw="22.5rem"
      c="text-medium"
      m="0 auto"
    >
      <Center className={S.noResultsIcon}>
        <Icon name="database" c="inherit" />
      </Center>
      <Text
        ta="center"
        c="inherit"
      >{t`Sorry, we couldn't find this data source. Try uploading your data in the CSV format instead.`}</Text>
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
