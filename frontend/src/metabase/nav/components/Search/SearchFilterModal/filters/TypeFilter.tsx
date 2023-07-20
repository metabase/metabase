import { getTranslatedEntityName } from "metabase/nav/utils";
import { Checkbox, Flex } from "metabase/ui";
import { SearchFilter } from "metabase/nav/components/Search/SearchFilterModal/filters/SearchFilter";
import { SearchModelType } from "metabase-types/api";
import Search from "metabase/entities/search";

const SEARCH_QUERY = { models: "dataset", limit: 1 } as const;

export const TypeFilter = ({
  value,
  onChange,
}: {
  value: any;
  onChange: (value: any) => void;
}) => {
  return (
    <SearchFilter title="Type">
      <Search.ListLoader query={SEARCH_QUERY} wrapped>
        {({
          metadata,
        }: {
          metadata: { available_models?: Array<SearchModelType> };
        }) => (
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
            {(metadata.available_models ?? []).map((model: SearchModelType) => (
              <Checkbox
                key={model}
                value={model}
                label={getTranslatedEntityName(model)}
              />
            ))}
          </Checkbox.Group>
        )}
      </Search.ListLoader>
    </SearchFilter>
  );
};
