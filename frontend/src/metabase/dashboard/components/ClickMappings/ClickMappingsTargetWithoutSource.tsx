import { assocIn } from "icepick";
import { t } from "ttag";

import { Select } from "metabase/common/components/Select";
import { Flex } from "metabase/ui";
import type { ClickBehavior } from "metabase-types/api";

import S from "./ClickMappings.module.css";
import type { SourceOption, SourceOptionsByType, TargetItem } from "./types";

export function ClickMappingsTargetWithoutSource({
  target,
  sourceOptions,
  clickBehavior,
  updateSettings,
}: {
  target: TargetItem;
  sourceOptions: SourceOptionsByType;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const { id, name, type } = target;

  return (
    <Select
      key={id}
      triggerElement={
        <Flex
          className={S.TargetTrigger}
          p="sm"
          mb="sm"
          fw="bold"
          w="100%"
          data-testid="click-target-column"
        >
          {name}
        </Flex>
      }
      value={null}
      sections={Object.entries(sourceOptions).map(([sourceType, items]) => ({
        name: {
          parameter: t`Dashboard filters`,
          column: t`Columns`,
          userAttribute: t`User attributes`,
        }[sourceType],
        items,
      }))}
      optionValueFn={getKeyForSource}
      optionNameFn={(option: SourceOption) =>
        option.type == null ? t`None` : option.name
      }
      onChange={({ target: { value } }: { target: { value: string } }) => {
        updateSettings(
          assocIn(clickBehavior, ["parameterMapping", id], {
            source: Object.values(sourceOptions)
              .flat()
              .find((option) => getKeyForSource(option) === value),
            target: target.target,
            id,
            type,
          }),
        );
      }}
    />
  );
}

const getKeyForSource = (option: SourceOption) =>
  option.type == null ? null : `${option.type}-${option.id}`;
