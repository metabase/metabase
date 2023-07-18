import { useSelector } from "metabase/lib/redux";
import { getTranslatedEntityName } from "metabase/nav/utils";
import { Checkbox, Flex } from "metabase/ui";
import { SearchFilter } from "metabase/nav/components/Search/SearchFilterModal/filters/SearchFilter";
import { SearchModelType } from "metabase-types/api";

export const TypeFilter = ({
  value,
  onChange,
}: {
  value: any;
  onChange: (value: any) => void;
}) => {
  const availableModels = useSelector(
    state =>
      state.entities.search_list[
        Object.keys(state.entities.search_list).find(k => k.includes("model"))
      ]?.metadata?.available_models ?? [],
  );

  return (
    <SearchFilter title="Type">
      <Checkbox.Group
        value={value}
        onChange={onChange}
        style={{ height: "100%" }}
        inputContainer={children => (
          <Flex
            direction={{ base: "column" }}
            gap={{ base: "xs" }}
            wrap={{ base: "wrap" }}
            style={{ height: "100%" }}
          >
            {children}
          </Flex>
        )}
      >
        {availableModels.map((model: SearchModelType) => (
          <Checkbox
            key={model}
            value={model}
            label={getTranslatedEntityName(model)}
          />
        ))}
      </Checkbox.Group>
    </SearchFilter>
  );
};
