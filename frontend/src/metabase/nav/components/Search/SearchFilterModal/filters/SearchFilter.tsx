import { Grid, Title } from "metabase/ui";

export const SearchFilter = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  return (
    <Grid>
      <Grid.Col span={2}>
        <Title order={6}>{title}</Title>
      </Grid.Col>
      <Grid.Col span="auto">{children}</Grid.Col>
    </Grid>
  );
};
