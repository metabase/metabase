const ROOT_URL = "/admin/security-center";

export const securityCenter = () => ROOT_URL;

export const securityCenterAdvisories = () => `${ROOT_URL}/advisories`;

export const securityCenterNotifications = () =>
  `${securityCenterAdvisories()}?open=notifications`;

export const securityCenterHealthChecks = () => `${ROOT_URL}/health-checks`;
