import { t } from "ttag";

import type { Dispatch, GetState } from "metabase/redux/store";
import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

type Dispatcher = (dispatch: Dispatch, getState: GetState) => void;

export const zoomDrill: Drill<Lib.ZoomDrillThruInfo> = ({
  drill,
  drillInfo,
  clicked,
  applyDrill,
}) => {
  const { objectId, isManyPks } = drillInfo;
  const isDashboard = clicked.extraData?.dashboard != null;
  const zoomInRow = clicked.extraData?.zoomInRow as
    | ((opts: { objectId: string | number }) => Dispatcher)
    | undefined;

  const base = {
    name: "zoom",
    section: "details",
    title: t`View details`,
    buttonType: "horizontal",
    icon: "sidebar_open",
    default: true,
    ...(!isManyPks ? { extra: () => ({ objectId }) } : {}),
  } as const;

  if (isDashboard) {
    return [{ ...base, question: () => applyDrill(drill, objectId) }];
  }

  if (zoomInRow) {
    return [{ ...base, action: () => zoomInRow({ objectId }) }];
  }

  return [];
};
