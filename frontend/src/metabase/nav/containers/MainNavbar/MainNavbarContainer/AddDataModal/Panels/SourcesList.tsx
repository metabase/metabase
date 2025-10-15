import { useState } from "react";
import { t } from "ttag";

import {
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

import S from "./SourcesList.module.css";

interface Source {
  name: string;
  value: string;
  category: "database" | "application";
}

const SOURCES: Source[] = [
  { name: "PostgreSQL", value: "postgres", category: "database" },
  { name: "Snowflake", value: "snowflake", category: "database" },
  { name: "BigQuery", value: "bigquery-cloud-sdk", category: "database" },
  { name: "Stripe", value: "stripe", category: "application" },
  { name: "Pipedrive", value: "pipedrive", category: "application" },
];

interface SourcesListProps {
  onSubmit: (data: {
    name: string;
    source: string;
    details: Record<string, string>;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const SourcesList = ({ onSubmit }: SourcesListProps) => {
  const combobox = useCombobox();
  const [search, setSearch] = useState("");
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    connection_string: "",
    apiKey: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchResults = SOURCES.filter(({ name }) =>
    name.toLowerCase().includes(search.toLowerCase().trim()),
  );

  const handleSourceSelect = (sourceKey: string) => {
    const source = SOURCES.find((s) => s.value === sourceKey);
    if (source) {
      setSelectedSource(source);
      setFormData({ name: "", connection_string: "", apiKey: "" });
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedSource) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const details: Record<string, string> = {};
    if (selectedSource.category === "database") {
      details.connection_string = formData.connection_string;
    } else {
      details.apiKey = formData.apiKey;
    }

    const result = await onSubmit({
      name: formData.name,
      source: selectedSource.value,
      details,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || t`Failed to add source. Please try again.`);
    }
  };

  const isFormValid =
    formData.name.trim() !== "" &&
    (selectedSource?.category === "database"
      ? formData.connection_string.trim() !== ""
      : formData.apiKey.trim() !== "");

  const handleBack = () => {
    setSelectedSource(null);
    setFormData({ name: "", connection_string: "", apiKey: "" });
    setError(null);
  };

  return (
    <Stack gap="lg" h="100%" style={{ overflow: "hidden" }}>
      {!selectedSource ? (
        <Stack gap="lg" style={{ flex: 1, overflow: "auto" }}>
          <Combobox
            store={combobox}
            classNames={{
              search: S.search,
              options: S.options,
              option: S.option,
            }}
          >
            <Combobox.Search
              placeholder={t`Search sources`}
              leftSection={<Icon name="search" />}
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
              }}
            />

            {searchResults.length > 0 ? (
              <ScrollArea type="hover" scrollHideDelay={300}>
                <Combobox.Options>
                  {searchResults.map(({ value: sourceKey, name }) => {
                    return (
                      <Combobox.Option
                        key={sourceKey}
                        value={sourceKey}
                        onClick={() => handleSourceSelect(sourceKey)}
                      >
                        <Group gap="sm">
                          <SourceLogo source={sourceKey} />
                          <span>{name}</span>
                        </Group>
                      </Combobox.Option>
                    );
                  })}
                </Combobox.Options>
              </ScrollArea>
            ) : (
              <NoSourceFound />
            )}
          </Combobox>
        </Stack>
      ) : (
        <Stack gap="md" style={{ flex: 1, overflow: "auto" }}>
          <Button
            variant="subtle"
            leftSection={<Icon name="chevronleft" />}
            onClick={handleBack}
          >
            {t`Back to sources`}
          </Button>

          <Stack gap="md">
            <Group gap="sm">
              <SourceLogo source={selectedSource.value} />
              <strong>{selectedSource.name}</strong>
            </Group>

            {error && (
              <Text c="error" size="sm">
                {error}
              </Text>
            )}

            <TextInput
              label={t`Name`}
              placeholder={t`Enter a name for this source`}
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />

            {selectedSource.category === "database" ? (
              <TextInput
                label={t`Connection string`}
                placeholder={t`Enter connection string`}
                value={formData.connection_string}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    connection_string: e.target.value,
                  })
                }
                required
              />
            ) : (
              <TextInput
                label={t`API key`}
                placeholder={t`Enter API key`}
                value={formData.apiKey}
                onChange={(e) =>
                  setFormData({ ...formData, apiKey: e.target.value })
                }
                required
              />
            )}

            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
            >
              {isSubmitting ? t`Adding...` : t`Add`}
            </Button>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
};

const SourceLogo = ({ source }: { source: string }) => {
  const sourceLogoMap: Record<string, string> = {
    postgres: "postgres.svg",
    snowflake: "snowflake.svg",
    "bigquery-cloud-sdk": "bigquery.svg",
    stripe: "database",
    pipedrive: "database",
  };

  const logo = sourceLogoMap[source];
  const isImageLogo = logo && !logo.includes("database");

  return (
    <Center h="lg" w="lg">
      {isImageLogo ? (
        <img src={`app/assets/img/drivers/${logo}`} width="100%" />
      ) : (
        <Icon name="database" c="brand" />
      )}
    </Center>
  );
};

const NoSourceFound = () => {
  return (
    <Stack
      gap="md"
      align="center"
      pt="lg"
      maw="22.5rem"
      c="text-medium"
      m="0 auto"
    >
      <Center className={S.noResultsIcon} w="3rem" h="3rem">
        <Icon name="database" c="inherit" />
      </Center>
      <span>{t`Sorry, we couldn't find this data source.`}</span>
    </Stack>
  );
};
