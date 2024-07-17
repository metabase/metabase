import { t } from "ttag";

import { useListCompatibleCardsQuery } from "metabase/api";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Menu, Text, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

export function CompatibleSeriesButton({ question }: { question: Question }) {
  const mainCardId = question.id();

  const { status, data: compatibleCards = [] } = useListCompatibleCardsQuery({
    id: mainCardId,
  });

  if (status !== "fulfilled" || compatibleCards.length === 0) {
    return null;
  }

  return (
    <Menu>
      <Menu.Target>
        <Tooltip label={t`See this alongside…`}>
          <Button onlyIcon icon="add" iconSize={16} color={color("brand")} />
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {compatibleCards.map(card => (
          <Menu.Item key={card.id}>
            <Link to={Urls.visualizer([question.card(), card])}>
              <Text>{card.name}</Text>
            </Link>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
