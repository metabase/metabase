import { useGetDashboardQuery } from "metabase/api";
import { useTranslateContent } from "metabase/i18n/hooks";
import { getName } from "metabase/utils/name";
import type { DashboardId } from "metabase-types/api";

interface DashboardNameProps {
  id: DashboardId | null | undefined;
}

export const DashboardName = ({ id }: DashboardNameProps) => {
  if (id == null || (typeof id === "number" && isNaN(id))) {
    return null;
  }
  return <FetchedDashboardName id={id} />;
};

const FetchedDashboardName = ({ id }: { id: DashboardId }) => {
  const tc = useTranslateContent();
  const { currentData: dashboard } = useGetDashboardQuery({ id });
  if (!dashboard) {
    return null;
  }
  return <span>{tc(getName(dashboard))}</span>;
};
