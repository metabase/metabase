import { useState } from "react";
import { t } from "ttag";

import { AccordionList } from "metabase/common/components/AccordionList";
import {
  isMappableColumn,
  withUserAttributes,
} from "metabase/dashboard/components/ClickMappings";
import { Flex, Icon, Popover, UnstyledButton } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { DashboardCard } from "metabase-types/api";

import S from "./ValuesYouCanReference.module.css";

interface ValuesYouCanReferenceProps {
  dashcard: DashboardCard;
  parameters: UiParameter[];
  userAttributes: string[];
}

interface Section {
  items: string[];
  name: string;
}

function prefixIfNeeded(
  values: string[],
  prefix: string,
  otherLists: string[][],
): string[] {
  const otherValues = otherLists.flat().map((s) => s.toLowerCase());
  return values.map((value) =>
    otherValues.includes(value.toLowerCase()) ? `${prefix}:${value}` : value,
  );
}

const ValuesYouCanReferenceComponent = ({
  dashcard,
  parameters,
  userAttributes,
}: ValuesYouCanReferenceProps) => {
  const [opened, setOpened] = useState(false);

  const columnMetadata = dashcard.card.result_metadata || [];
  const columns = columnMetadata?.filter(isMappableColumn).map((c) => c.name);
  const parameterNames = parameters.map((p) => p.name);

  const sections: Section[] = [
    {
      items: prefixIfNeeded(columns, "column", [
        parameterNames,
        userAttributes,
      ]),
      name: t`Columns`,
    },
    {
      items: prefixIfNeeded(parameterNames, "filter", [
        columns,
        userAttributes,
      ]),
      name: t`Dashboard filters`,
    },
    {
      items: prefixIfNeeded(userAttributes, "user", [parameterNames, columns]),
      name: t`User attributes`,
    },
  ].filter((section) => section.items.length > 0);

  if (!sections.length) {
    return null;
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start">
      <Popover.Target>
        <UnstyledButton onClick={() => setOpened(!opened)}>
          <Flex align="center" className={S.PopoverTrigger}>
            <h4>{t`Values you can reference`}</h4>
            <Icon name="chevrondown" ml="sm" size={12} />
          </Flex>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <AccordionList
          alwaysExpanded
          sections={sections}
          renderItemName={(name) => name.toString()}
          itemIsClickable={() => false}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

export const ValuesYouCanReference = withUserAttributes(
  ValuesYouCanReferenceComponent,
);
