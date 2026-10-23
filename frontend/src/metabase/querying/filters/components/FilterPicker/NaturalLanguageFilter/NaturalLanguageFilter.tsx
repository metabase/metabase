import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { useBuildPrototypeFiltersMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import { useSetting } from "metabase/settings";
import { Box, Icon, Loader, Text, TextInput } from "metabase/ui";
import * as Lib from "metabase-lib";

import { WIDTH } from "../constants";
import type { FilterChangeOpts } from "../types";

import S from "./NaturalLanguageFilter.module.css";

type NaturalLanguageFilterProps = {
  query: Lib.Query;
  onChange: (newQuery: Lib.Query, opts: FilterChangeOpts) => void;
};

/**
 * Prototype: a text box that asks Metabot to add filters to the query from a
 * description in natural language. Metabot uses the segments, glossary and AI
 * context of the instance.
 */
export function NaturalLanguageFilter({
  query,
  onChange,
}: NaturalLanguageFilterProps) {
  const isMetabotEnabled = useSetting("metabot-enabled?");
  const metadataProvider = useMetadataProvider(Lib.databaseID(query));
  const [buildFilters, { isLoading }] = useBuildPrototypeFiltersMutation();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string>();

  if (!isMetabotEnabled) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const request = text.trim();
    if (request === "" || isLoading) {
      return;
    }

    setMessage(undefined);
    try {
      const response = await buildFilters({
        query: Lib.toLegacyQuery(query),
        message: request,
      }).unwrap();
      if (response.query === undefined) {
        setMessage(response.error);
        return;
      }
      const { newQuery, addedCount } = addGeneratedFilters(
        query,
        Lib.fromJsQuery(metadataProvider, response.query),
      );
      if (addedCount > 0) {
        onChange(newQuery, { run: true });
      } else {
        setMessage(t`Metabot did not add filters.`);
      }
    } catch (error) {
      setMessage(
        getErrorMessage(error, t`Metabot could not build the filters.`),
      );
    }
  };

  return (
    <Box className={S.Root} p="md" w={WIDTH}>
      <form onSubmit={handleSubmit}>
        <TextInput
          value={text}
          placeholder={t`Describe the rows you want…`}
          leftSection={
            isLoading ? <Loader size="xs" /> : <Icon name="metabot" />
          }
          disabled={isLoading}
          autoFocus
          onChange={(event) => setText(event.target.value)}
        />
      </form>
      {message !== undefined && (
        <Text size="sm" c="text-secondary" mt="sm">
          {message}
        </Text>
      )}
    </Box>
  );
}

function getFilterNames(query: Lib.Query, stageIndex: number): string[] {
  return Lib.filters(query, stageIndex).map(
    (filter) => Lib.displayInfo(query, stageIndex, filter).displayName,
  );
}

// Metabot sends back the whole query. Take only the filters that are new, so that
// other changes of the query are ignored.
function addGeneratedFilters(
  query: Lib.Query,
  generatedQuery: Lib.Query,
): { newQuery: Lib.Query; addedCount: number } {
  const stageCount = Lib.stageCount(query);
  let newQuery = query;
  let addedCount = 0;

  Lib.stageIndexes(generatedQuery).forEach((stageIndex) => {
    const existingNames =
      stageIndex < stageCount ? getFilterNames(query, stageIndex) : [];
    const newFilters = Lib.filters(generatedQuery, stageIndex).filter(
      (filter) =>
        !existingNames.includes(
          Lib.displayInfo(generatedQuery, stageIndex, filter).displayName,
        ),
    );
    if (newFilters.length === 0) {
      return;
    }

    let targetStageIndex = stageIndex;
    if (stageIndex >= Lib.stageCount(newQuery)) {
      newQuery = Lib.ensureFilterStage(newQuery);
      targetStageIndex = Lib.stageCount(newQuery) - 1;
    }
    newFilters.forEach((filter) => {
      newQuery = Lib.filter(newQuery, targetStageIndex, filter);
      addedCount++;
    });
  });

  return { newQuery, addedCount };
}
