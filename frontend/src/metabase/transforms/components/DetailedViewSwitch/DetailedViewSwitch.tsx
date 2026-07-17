import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { Switch } from "metabase/ui";
import * as Urls from "metabase/urls";

type DetailedViewSwitchProps = {
  detailed: boolean;
};

export function DetailedViewSwitch({ detailed }: DetailedViewSwitchProps) {
  const dispatch = useDispatch();

  const handleChange = () => {
    dispatch(
      push(detailed ? Urls.transformGraphRunList() : Urls.transformRunList()),
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
