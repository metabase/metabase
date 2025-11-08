import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { SegmentedControl } from "metabase/ui";

import { useTransformsCurrentTab } from "../hooks";

const NAV_ITEMS = [
  {
    get label() {
      return t`Transforms`;
    },
    value: "transforms",
    url: Urls.transformList(),
  },
  {
    get label() {
      return t`Jobs`;
    },
    value: "jobs",
    url: Urls.transformJobList(),
  },
  {
    get label() {
      return t`Runs`;
    },
    value: "runs",
    url: Urls.transformRunList(),
  },
];

export const TransformsInnerNav = () => {
  const dispatch = useDispatch();
  const currentTab = useTransformsCurrentTab();

  const handleChange = useCallback(
    (newValue: string) => {
      const item = NAV_ITEMS.find((item) => item.value === newValue);
      if (item) {
        dispatch(push(item.url));
      }
    },
    [dispatch],
  );

  return (
    <SegmentedControl
      fullWidth
      value={currentTab}
      onChange={handleChange}
      data={NAV_ITEMS}
    />
  );
};
