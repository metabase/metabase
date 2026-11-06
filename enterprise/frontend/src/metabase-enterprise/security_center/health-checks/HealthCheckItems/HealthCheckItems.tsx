import { c } from "ttag";

import { Accordion, Card, FixedSizeIcon } from "metabase/ui";
import type {
  HealthCheck,
  HealthCheckId,
  HealthCheckItem,
} from "metabase-types/api";

import { HealthCheckItemRow } from "../HealthCheckItemRow/HealthCheckItemRow";
import { getItemsByStatus, getStatusInfo } from "../utils";

import S from "./HealthCheckItems.module.css";

type PassedItemsProps = {
  checkId: HealthCheckId;
  items: HealthCheckItem[];
};

const PassedItems = ({ checkId, items }: PassedItemsProps) => {
  const { icon, iconColor } = getStatusInfo("pass");

  return (
    <Accordion
      radius={0}
      transitionDuration={0}
      classNames={{ content: S.passedContent }}
    >
      <Accordion.Item value="passed">
        <Accordion.Control icon={<FixedSizeIcon name={icon} c={iconColor} />}>
          {c("{0} is the number of passed items").t`Passed (${items.length})`}
        </Accordion.Control>
        <Accordion.Panel>
          {items.map((item, index) => (
            <HealthCheckItemRow key={index} checkId={checkId} item={item} />
          ))}
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};

type HealthCheckItemsProps = {
  check: HealthCheck;
};

export const HealthCheckItems = ({ check }: HealthCheckItemsProps) => {
  const problemItems = [
    ...getItemsByStatus(check.items, "fail"),
    ...getItemsByStatus(check.items, "unknown"),
  ];
  const passedItems = getItemsByStatus(check.items, "pass");
  const isPassedCollapsed = problemItems.length > 0 && passedItems.length > 0;
  const visibleItems = isPassedCollapsed
    ? problemItems
    : [...problemItems, ...passedItems];

  return (
    <Card withBorder p={0} className={S.itemList}>
      {visibleItems.map((item, index) => (
        <HealthCheckItemRow key={index} checkId={check.id} item={item} />
      ))}
      {isPassedCollapsed && (
        <PassedItems checkId={check.id} items={passedItems} />
      )}
    </Card>
  );
};
