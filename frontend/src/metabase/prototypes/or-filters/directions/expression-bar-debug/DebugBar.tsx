import { useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Flex,
  Icon,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type * as Lib from "metabase-lib";

import { withFourLevelsExample } from "../../harness/examples";
import {
  ExpressionBar,
  type ExpressionBarProps,
} from "../expression-bar-drill/ExpressionBar";
import { withSumOfTotalByMonth } from "../expression-bar-drill/QuestionView";
import { readRailTree } from "../railroad/railroad";

import { VerticalRailroad } from "./VerticalRailroad";

const STAGE_INDEX = 0;

/** The drill-through question, with `a or (b and (c or (d and e)))` applied. */
export function withFourLevelsByMonth(query: Lib.Query): Lib.Query {
  return withFourLevelsExample(withSumOfTotalByMonth(query), STAGE_INDEX);
}

// Canned for the prototype: what an LLM would write for the prefilled filter.
const getExplanation = () => [
  t`This shows orders with a total over $100, no matter what else is true about them.`,
  t`Orders of $100 or less are only kept if their tax is over $2 and, on top of that, one of these is true:`,
  t`• they got a discount of more than $1, or`,
  t`• their subtotal is under $50 and they have more than 3 items.`,
];

/** The drill-through bar with an "Explain" button on its right. */
export function DebugBar(props: ExpressionBarProps) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Flex align="stretch">
      <Box flex={1} miw={0}>
        <ExpressionBar {...props} />
      </Box>
      <Flex
        align="center"
        pr="xxl"
        style={{ borderBottom: "1px solid var(--mb-color-border-neutral)" }}
      >
        <Button
          size="compact-sm"
          variant="subtle"
          leftSection={<Icon name="metabot" c="icon-brand" />}
          onClick={() => setIsOpened(true)}
        >
          {t`Explain`}
        </Button>
      </Flex>
      <ExplainModal
        query={props.query}
        stageIndex={props.stageIndex}
        opened={isOpened}
        onClose={() => setIsOpened(false)}
      />
    </Flex>
  );
}

type ExplainModalProps = {
  query: Lib.Query;
  stageIndex: number;
  opened: boolean;
  onClose: () => void;
};

function ExplainModal({
  query,
  stageIndex,
  opened,
  onClose,
}: ExplainModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`What this filter does`}
      size="auto"
    >
      <Stack gap="lg" maw="56rem">
        <Paper withBorder radius="md" p="md" bg="background-secondary">
          <Flex gap="sm" align="flex-start">
            <Icon name="metabot" c="icon-brand" mt={2} />
            <Stack gap="xs">
              {getExplanation().map((line, index) => (
                <Text key={index}>{line}</Text>
              ))}
            </Stack>
          </Flex>
        </Paper>
        <Box>
          <Title order={5} mb="sm">{t`How rows flow through it`}</Title>
          <Box style={{ overflowX: "auto" }}>
            <VerticalRailroad
              query={query}
              stageIndex={stageIndex}
              root={readRailTree(query, stageIndex)}
            />
          </Box>
        </Box>
      </Stack>
    </Modal>
  );
}
