import { Ellipsified } from "metabase/common/components/Ellipsified";
import DashboardS from "metabase/css/dashboard.module.css";
import { Text } from "metabase/ui";

interface ScalarPeriodProps {
  period: string | number | JSX.Element | null;
  onClick?: () => void;
}

export function ScalarPeriod({ period, onClick }: ScalarPeriodProps) {
  return (
    <Text
      data-testid="scalar-period"
      component="h3"
      ta="center"
      style={{ cursor: onClick && "pointer" }}
      fw={700}
      lh="1rem"
      className={DashboardS.fullscreenNormalText}
      onClick={onClick}
    >
      <Ellipsified
        tooltip={period}
        lines={1}
        tooltipProps={{ position: "bottom" }}
      >
        {period}
      </Ellipsified>
    </Text>
  );
}
