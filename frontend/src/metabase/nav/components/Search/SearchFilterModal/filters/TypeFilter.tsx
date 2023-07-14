import { useState } from "react";
import { useSelector } from "metabase/lib/redux";
import { getTranslatedEntityName } from "metabase/nav/utils";
import { Checkbox, Flex } from "metabase/ui";
import { SearchFilter } from "metabase/nav/components/Search/SearchFilterModal/filters/SearchFilter";
import { SearchModelType } from "metabase-types/api";

export const TypeFilter = () => {
  const availableModels = useSelector(
    state =>
      state.entities.search_list[Object.keys(state.entities.search_list)[0]]
        .metadata.available_models,
  );

  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  return (
    <SearchFilter title="Type">
      <Flex
        direction={{ base: "column" }}
        gap={{ base: "sm" }}
        wrap={{ base: "wrap" }}
      >
        <Checkbox.Group
          value={selectedModels}
          onChange={value => setSelectedModels(value)}
          style={{
            height: "10rem",
          }}
        >
          {availableModels.map((model: SearchModelType) => (
            <Checkbox
              key={model}
              value={model}
              label={getTranslatedEntityName(model)}
            />
          ))}
        </Checkbox.Group>
      </Flex>
    </SearchFilter>
  );
};
