import { t } from "ttag";
import { Flex, Group, Switch, Text } from "metabase/ui";
import type { BrowseFilterControlsProps } from "metabase/browse/utils";

export const BrowseFilterControls = ({
  filters,
  setFilter,
}: BrowseFilterControlsProps) => {
  return (
    <Switch
      label={
        <Group grow>
          <Flex direction="column" justify="center">
            <Text
              align="right"
              weight="bold"
              lh="1rem"
            >{t`Only show verified models`}</Text>
          </Flex>
        </Group>
      }
      checked={filters.onlyShowVerifiedModels.active}
      onChange={e => {
        setFilter("onlyShowVerifiedModels", e.target.checked);
      }}
      ml="auto"
      size="sm"
      labelPosition="left"
    />
  );
};
