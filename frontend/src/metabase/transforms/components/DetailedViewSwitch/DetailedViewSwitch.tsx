import { t } from "ttag";

import { useNavigate } from "metabase/router";
import { trackTransformRunsViewToggled } from "metabase/transforms/analytics";
import { Switch } from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./DetailedViewSwitch.module.css";

type DetailedViewSwitchProps = {
  detailed: boolean;
  params: Urls.CommonRunListParams;
};

export function DetailedViewSwitch({
  detailed,
  params,
}: DetailedViewSwitchProps) {
  const navigate = useNavigate();

  const handleChange = () => {
    const nextView = detailed ? "grouped" : "detailed";
    trackTransformRunsViewToggled({ view: nextView });
    navigate(
      detailed
        ? Urls.transformGraphRunList(params)
        : Urls.transformRunList(params),
    );
  };

  return (
    <Switch
      label={t`Detailed view`}
      labelPosition="left"
      checked={detailed}
      onChange={handleChange}
      classNames={{ label: S.label }}
      data-testid="detailed-view-switch"
    />
  );
}
