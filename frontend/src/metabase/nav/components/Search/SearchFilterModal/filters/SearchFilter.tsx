import { t } from "ttag";
import { Grid, Title } from "metabase/ui";
import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/core/components/Icon";

export const SearchFilter = ({
  title,
  tooltip,
  children,
}: {
  title: string;
  tooltip?: string;
  children: React.ReactNode;
}) => {
  return (
    <Grid style={{ height: "10rem" }}>
      <Grid.Col span={2}>
        <Title order={5}>{title}</Title>
        {tooltip && (
          <Tooltip tooltip={t`Test`}>
            <Icon name="info_outline" />
          </Tooltip>
        )}
      </Grid.Col>
      <Grid.Col style={{ height: "100%" }} span="auto">
        {children}
      </Grid.Col>
    </Grid>
  );
};
