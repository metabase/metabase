export const hasGreetingSection = ({ user }) => {
  return user != null;
};

export const hasContentSections = ({ user, databases, dashboards }) => {
  return user != null && databases != null && dashboards != null;
};

export const hasStartHereSection = ({
  user,
  databases,
  dashboards,
  showPinNotice,
}) => {
  return (
    hasDatabaseBanner({ user, databases }) ||
    hasDashboardBanner({ dashboards, showPinNotice }) ||
    hasDashboardList({ dashboards })
  );
};

export const hasXraySection = ({ candidates, dashboards, showXrays }) => {
  return candidates?.length && !dashboards.length && showXrays;
};

export const hasOurDataSection = ({ showOurData }) => {
  return showOurData;
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
