export const hasStartHereSection = options => {
  return (
    hasDatabaseBanner(options) ||
    hasDashboardBanner(options) ||
    hasDashboardList(options)
  );
};

export const hasXraySection = ({ candidates, dashboards, showXrays }) => {
  return candidates.length && !dashboards.length && showXrays;
};

export const hasOurDataSection = ({ showData }) => {
  return showData;
};

export const hasDatabaseBanner = ({ user, databases }) => {
  return user.is_superuser && databases.every(d => d.is_sample);
};

export const hasDashboardBanner = ({ dashboards, showPinNotice }) => {
  return !dashboards.length && showPinNotice;
};

export const hasDashboardList = ({ dashboards }) => {
  return dashboards.length;
};
