import type { Location } from "history";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { SegmentedControl } from "metabase/ui";

interface TransformsInnerNavProps {
  location: Location;
}

const TRANSFORMS_BASE_PATH = "/bench/transforms";

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

type NavValue = (typeof NAV_ITEMS)[number]["value"];

function getActiveNavValue(pathname: string): NavValue {
  const pathSegments = pathname.split("/").filter(Boolean);
  const transformsIndex = pathSegments.indexOf("transforms");

  if (transformsIndex === -1 || transformsIndex >= pathSegments.length - 1) {
    return "transforms";
  }

  const nextSegment = pathSegments[transformsIndex + 1];

  if (nextSegment === "jobs" || nextSegment === "runs") {
    return nextSegment;
  }

  return "transforms";
}

export const TransformsInnerNav = ({ location }: TransformsInnerNavProps) => {
  const dispatch = useDispatch();

  const value = useMemo(
    () => getActiveNavValue(location.pathname),
    [location.pathname],
  );

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
      value={value}
      onChange={handleChange}
      data={NAV_ITEMS}
    />
  );
};
