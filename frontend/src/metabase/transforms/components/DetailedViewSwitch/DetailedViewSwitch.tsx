import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { trackTransformRunsViewToggled } from "metabase/transforms/analytics";
import { Switch } from "metabase/ui";
import * as Urls from "metabase/urls";

type DetailedViewSwitchProps = {
  detailed: boolean;
  params: Urls.CommonRunListParams;
};

export function DetailedViewSwitch({
  detailed,
  params,
}: DetailedViewSwitchProps) {
  const dispatch = useDispatch();

  const handleChange = () => {
    const nextView = detailed ? "grouped" : "detailed";
    trackTransformRunsViewToggled({ view: nextView });
    dispatch(
      push(
        detailed
          ? Urls.transformGraphRunList(params)
          : Urls.transformRunList(params),
      ),
    );
  };

  return (
    <Switch
      label={t`Detailed view`}
      labelPosition="left"
      checked={detailed}
      onChange={handleChange}
      styles={{ label: { whiteSpace: "nowrap" } }}
      data-testid="detailed-view-switch"
    />
  );
}
