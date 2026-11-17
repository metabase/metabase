import { Link } from "metabase/common/components/Link";
import { Card, Ellipsified, Flex, Icon, Stack, Text, rem } from "metabase/ui";
import type { Measure } from "metabase-types/api";

import { ClausePills, type QueryClause } from "../../ClausePills";

import S from "./MeasureItem.module.css";

type MeasureItemProps = {
  measure: Measure;
  href: string;
  /** Its aggregations and filters, one pill each; else the server's description */
  clauses?: QueryClause[];
};

export function MeasureItem({ measure, href, clauses }: MeasureItemProps) {
  return (
    <Card
      className={S.card}
      component={Link}
      to={href}
      aria-label={measure.name}
      role="listitem"
      px="lg"
      py={rem(12)}
      radius="lg"
      shadow="none"
      withBorder
    >
      <Stack gap="xs">
        <Flex align="center" gap="sm">
          <Icon name="ruler" c="core-brand" />
          <Ellipsified lines={1} tooltip={measure.name}>
            <Text fw="bold">{measure.name}</Text>
          </Ellipsified>
        </Flex>

        {clauses != null && clauses.length > 0 ? (
          <ClausePills clauses={clauses} />
        ) : (
          measure.definition_description && (
            <Text lh="lg" data-testid="list-item-description">
              {measure.definition_description}
            </Text>
          )
        )}
      </Stack>
    </Card>
  );
}
