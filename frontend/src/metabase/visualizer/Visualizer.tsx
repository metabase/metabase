import _ from "underscore";

import { QuestionPicker } from "metabase/dashboard/components/QuestionPicker";
import { Card, Grid } from "metabase/ui";
import type { CardId } from "metabase-types/api";

export function Visualizer() {
  const handleQuestionSelected = (_questionId: CardId) => {
    // wip
  };

  return (
    <Grid p="md" w="100%" h="100%">
      <Grid.Col span={3}>
        <QuestionPicker onSelect={handleQuestionSelected} onClose={_.noop} />
      </Grid.Col>
      <Grid.Col span={9}>
        <Card withBorder w="100%" h="100%">
          Funnel visualizer here! Expected data shape: 1 numeric column + 1
          string column
        </Card>
      </Grid.Col>
    </Grid>
  );
}
