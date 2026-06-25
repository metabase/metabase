import { assocIn } from "icepick";
import { Fragment } from "react";
import { t } from "ttag";

import { Flex, Menu } from "metabase/ui";
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

  const handleSelect = (source: SourceOption) => {
    updateSettings(
      assocIn(clickBehavior, ["parameterMapping", id], {
        source,
        target: target.target,
        id,
        type,
      }),
    );
  };

  return (
    <Menu key={id} position="bottom-start">
      <Menu.Target>
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
      </Menu.Target>
      <Menu.Dropdown>
        {Object.entries(sourceOptions).map(([sourceType, items]) => (
          <Fragment key={sourceType}>
            <Menu.Label>
              {
                {
                  parameter: t`Dashboard filters`,
                  column: t`Columns`,
                  userAttribute: t`User attributes`,
                }[sourceType]
              }
            </Menu.Label>
            {items.map((option) => (
              <Menu.Item
                key={getKeyForSource(option) ?? "none"}
                onClick={() => handleSelect(option)}
              >
                {option.type == null ? t`None` : option.name}
              </Menu.Item>
            ))}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

const getKeyForSource = (option: SourceOption) =>
  option.type == null ? null : `${option.type}-${option.id}`;
