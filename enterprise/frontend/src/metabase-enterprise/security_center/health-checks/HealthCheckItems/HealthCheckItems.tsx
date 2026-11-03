import { t } from "ttag";

import { Accordion, Card, FixedSizeIcon } from "metabase/ui";
import type {
  HealthCheck,
  HealthCheckId,
  HealthCheckItem,
} from "metabase-types/api";

import { HealthCheckItemRow } from "../HealthCheckItemRow/HealthCheckItemRow";
import { getStatusInfo, partitionItemsByProblem } from "../utils";

import S from "./HealthCheckItems.module.css";

type HealthCheckItemRowsProps = {
  checkId: HealthCheckId;
  items: HealthCheckItem[];
};

const HealthCheckItemRows = ({ checkId, items }: HealthCheckItemRowsProps) =>
  items.map((item, index) => (
    <HealthCheckItemRow key={index} checkId={checkId} item={item} />
  ));

const PassedItems = ({ checkId, items }: HealthCheckItemRowsProps) => {
  const { icon, iconColor } = getStatusInfo("pass");

  return (
    <Accordion
      radius={0}
      transitionDuration={0}
      classNames={{ content: S.passedContent }}
    >
      <Accordion.Item value="passed">
        <Accordion.Control icon={<FixedSizeIcon name={icon} c={iconColor} />}>
          {t`Passed (${items.length})`}
        </Accordion.Control>
        <Accordion.Panel>
          <HealthCheckItemRows checkId={checkId} items={items} />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};

type HealthCheckItemsProps = {
  check: HealthCheck;
};

export const HealthCheckItems = ({ check }: HealthCheckItemsProps) => {
  const [problemItems, passedItems] = partitionItemsByProblem(check.items);
  const isPassedCollapsed = problemItems.length > 0 && passedItems.length > 0;

  return (
    <Card withBorder p={0} className={S.itemList}>
      <HealthCheckItemRows
        checkId={check.id}
        items={
          isPassedCollapsed ? problemItems : [...problemItems, ...passedItems]
        }
      />
      {isPassedCollapsed && (
        <PassedItems checkId={check.id} items={passedItems} />
      )}
    </Card>
  );
};
