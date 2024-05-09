import { Grid } from "metabase/ui";

export function Visualizer() {
  return (
    <Grid p="md">
      <Grid.Col span={4}>Data sources here</Grid.Col>
      <Grid.Col span={8}>Visualization here</Grid.Col>
    </Grid>
  );
}
