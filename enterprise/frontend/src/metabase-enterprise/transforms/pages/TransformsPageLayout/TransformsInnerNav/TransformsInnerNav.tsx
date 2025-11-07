import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { SegmentedControl } from "metabase/ui";

import { useTransformsCurrentTab } from "../hooks";

const TRANSFORMS_BASE_PATH = "/data-studio/transforms";

const NAV_ITEMS = [
  {
    get label() {
      return t`Transforms`;
    },
    value: "transforms",
  },
  {
    get label() {
      return t`Jobs`;
    },
    value: "jobs",
  },
  {
    get label() {
      return t`Runs`;
    },
    value: "runs",
  },
];

export const TransformsInnerNav = () => {
  const dispatch = useDispatch();
  const currentTab = useTransformsCurrentTab();

  const handleChange = useCallback(
    (newValue: string) => {
      const path =
        newValue === "transforms"
          ? TRANSFORMS_BASE_PATH
          : `${TRANSFORMS_BASE_PATH}/${newValue}`;

      dispatch(push(path));
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
