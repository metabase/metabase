import { ReactNode } from "react";
import { Grid, Title } from "metabase/ui";
import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/core/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";

export const SearchFilterView = ({
  title,
  tooltip,
  isLoading,
  "data-testid": dataTestId,
  children,
}: {
  title: string;
  tooltip?: string;
  isLoading?: boolean;
  "data-testid"?: string;
  children: ReactNode;
}) => {
  return (
    <Grid data-testid={dataTestId}>
      <Grid.Col span={2} p={0}>
        <Title order={5}>{title}</Title>
        {tooltip && (
          <Tooltip tooltip={tooltip}>
            <Icon name="info_outline" />
          </Tooltip>
        )}
      </Grid.Col>
      <Grid.Col p={0} span="auto">
        {isLoading ? <LoadingSpinner /> : children}
      </Grid.Col>
    </Grid>
  );
};
